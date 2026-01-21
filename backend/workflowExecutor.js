/**
 * Workflow Executor
 * Core execution engine for workflows - can be called from API or scheduler
 */

const { supabase } = require('./services/supabase');
const { logger } = require('./services/logger');

/**
 * Execute a workflow by ID
 * This is the main entry point for executing workflows
 */
async function executeWorkflowById(executionId, workflow, userId) {
  const { graph } = workflow;

  try {
    // Mark execution as running
    await supabase
      .from('workflow_executions')
      .update({
        status: 'running',
        started_at: new Date().toISOString()
      })
      .eq('id', executionId);

    // Build execution order (topological sort)
    const executionOrder = topologicalSort(graph);

    if (!executionOrder) {
      throw new Error('Workflow contains a cycle');
    }

    // Context holds outputs from each node
    const context = {};
    let totalCreditsUsed = 0;

    // Execute nodes in order
    for (const nodeId of executionOrder) {
      const node = graph.nodes.find(n => n.id === nodeId);
      if (!node) continue;

      // Skip trigger nodes (they just initiate the flow)
      if (node.type === 'manual-trigger' || node.type === 'schedule-trigger') continue;

      // Update current node
      await supabase
        .from('workflow_executions')
        .update({ current_node_id: nodeId })
        .eq('id', executionId);

      // Create step result record
      const { data: stepResult } = await supabase
        .from('workflow_step_results')
        .insert({
          execution_id: executionId,
          node_id: nodeId,
          node_type: node.type,
          status: 'running',
          started_at: new Date().toISOString()
        })
        .select()
        .single();

      try {
        // First, resolve edge-connected inputs
        const configWithEdgeInputs = resolveEdgeInputs(nodeId, graph.edges, node.data?.config || {}, context);

        // Then resolve any {{nodeId.field}} variable syntax
        const resolvedConfig = resolveVariables(configWithEdgeInputs, context);

        // Execute the node
        const result = await executeNode(node.type, resolvedConfig, userId, context);

        // Store result in context
        context[nodeId] = result.output;
        totalCreditsUsed += result.creditsUsed || 0;

        // Update step result
        await supabase
          .from('workflow_step_results')
          .update({
            status: 'completed',
            input_data: resolvedConfig,
            output_data: result.output,
            credits_used: result.creditsUsed || 0,
            completed_at: new Date().toISOString()
          })
          .eq('id', stepResult.id);

        // Update execution context
        await supabase
          .from('workflow_executions')
          .update({
            context,
            credits_used: totalCreditsUsed
          })
          .eq('id', executionId);

      } catch (nodeError) {
        // Mark step as failed
        await supabase
          .from('workflow_step_results')
          .update({
            status: 'failed',
            error_message: nodeError.message,
            completed_at: new Date().toISOString()
          })
          .eq('id', stepResult.id);

        throw nodeError;
      }
    }

    // Mark execution as completed
    await supabase
      .from('workflow_executions')
      .update({
        status: 'completed',
        current_node_id: null,
        context,
        credits_used: totalCreditsUsed,
        completed_at: new Date().toISOString()
      })
      .eq('id', executionId);

    logger.info('Workflow execution completed', { executionId, creditsUsed: totalCreditsUsed });

  } catch (error) {
    // Mark execution as failed
    await supabase
      .from('workflow_executions')
      .update({
        status: 'failed',
        error_message: error.message,
        completed_at: new Date().toISOString()
      })
      .eq('id', executionId);

    logger.error('Workflow execution failed', { executionId, error: error.message });
    throw error;
  }
}

/**
 * Topological sort for execution order
 */
function topologicalSort(graph) {
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];

  // Build adjacency list and in-degree map
  const adjList = new Map();
  const inDegree = new Map();

  for (const node of nodes) {
    adjList.set(node.id, []);
    inDegree.set(node.id, 0);
  }

  for (const edge of edges) {
    adjList.get(edge.source)?.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  }

  // Kahn's algorithm
  const queue = [];
  const result = [];

  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) queue.push(nodeId);
  }

  while (queue.length > 0) {
    const nodeId = queue.shift();
    result.push(nodeId);

    for (const neighbor of adjList.get(nodeId) || []) {
      inDegree.set(neighbor, inDegree.get(neighbor) - 1);
      if (inDegree.get(neighbor) === 0) {
        queue.push(neighbor);
      }
    }
  }

  // Check for cycle
  if (result.length !== nodes.length) {
    return null; // Cycle detected
  }

  return result;
}

/**
 * Resolve edge-connected inputs
 */
function resolveEdgeInputs(nodeId, edges, config, context) {
  const resolvedConfig = { ...config };

  const incomingEdges = edges.filter(e => e.target === nodeId);

  for (const edge of incomingEdges) {
    const sourceOutput = context[edge.source];
    if (sourceOutput && edge.targetHandle) {
      const value = sourceOutput[edge.sourceHandle];
      if (value !== undefined) {
        resolvedConfig[edge.targetHandle] = value;
      }

      // Special handling: when connecting image_url, also pass image_urls array if available
      if (edge.sourceHandle === 'image_url' && sourceOutput.image_urls && Array.isArray(sourceOutput.image_urls)) {
        resolvedConfig.image_urls = sourceOutput.image_urls;
      }

      // Special handling: when connecting prompts, ensure the array is passed correctly
      if (edge.sourceHandle === 'prompts' && sourceOutput.prompts && Array.isArray(sourceOutput.prompts)) {
        resolvedConfig.prompts = sourceOutput.prompts;
      }
    }
  }

  return resolvedConfig;
}

/**
 * Resolve {{nodeId.field}} variables in config
 */
function resolveVariables(config, context) {
  const configStr = JSON.stringify(config);

  const resolved = configStr.replace(/\{\{(\w+)\.(\w+)\}\}/g, (match, nodeId, field) => {
    const nodeOutput = context[nodeId];
    if (nodeOutput && nodeOutput[field] !== undefined) {
      const value = nodeOutput[field];
      if (typeof value === 'string') {
        return value;
      }
      return JSON.stringify(value);
    }
    return match;
  });

  return JSON.parse(resolved);
}

/**
 * Execute a single node
 */
async function executeNode(nodeType, config, userId, context) {
  const { executeGenerateImage } = require('./services/workflowNodes/generateImage');
  const { executeSaveToGallery } = require('./services/workflowNodes/saveToGallery');
  const { executeGeneratePrompts } = require('./services/workflowNodes/generatePrompts');

  switch (nodeType) {
    case 'generate-prompts':
      return executeGeneratePrompts(config, userId, context);

    case 'generate-image':
      return executeGenerateImage(config, userId, context);

    case 'save-gallery':
      return executeSaveToGallery(config, userId, context);

    default:
      throw new Error(`Unknown node type: ${nodeType}`);
  }
}

module.exports = {
  executeWorkflowById,
  topologicalSort,
  resolveEdgeInputs,
  resolveVariables,
  executeNode
};

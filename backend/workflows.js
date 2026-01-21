/**
 * Workflows API
 * Visual workflow automation for Digital Divas
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { supabase } = require('./services/supabase');
const { requireAuth } = require('./middleware/auth');
const { logger } = require('./services/logger');
const { executeWorkflowById } = require('./workflowExecutor');

// =============================================
// GET /api/workflows
// List all workflows for the current user
// =============================================
router.get('/', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const userId = req.userId;

    const { data, error } = await supabase
      .from('workflows')
      .select(`
        id,
        name,
        description,
        is_enabled,
        trigger_type,
        trigger_config,
        created_at,
        updated_at,
        last_run_at
      `)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    // Get execution counts for each workflow
    const workflowsWithStats = await Promise.all(
      (data || []).map(async (workflow) => {
        const { count: totalRuns } = await supabase
          .from('workflow_executions')
          .select('id', { count: 'exact', head: true })
          .eq('workflow_id', workflow.id);

        const { count: successfulRuns } = await supabase
          .from('workflow_executions')
          .select('id', { count: 'exact', head: true })
          .eq('workflow_id', workflow.id)
          .eq('status', 'completed');

        return {
          ...workflow,
          stats: {
            total_runs: totalRuns || 0,
            successful_runs: successfulRuns || 0
          }
        };
      })
    );

    res.json({ workflows: workflowsWithStats });

  } catch (error) {
    logger.error('Error fetching workflows', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Failed to fetch workflows' });
  }
});

// =============================================
// GET /api/workflows/:id
// Get a single workflow with full graph data
// =============================================
router.get('/:id', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const userId = req.userId;
    const { id } = req.params;

    const { data, error } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Workflow not found' });
      }
      throw error;
    }

    res.json({ workflow: data });

  } catch (error) {
    logger.error('Error fetching workflow', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Failed to fetch workflow' });
  }
});

// =============================================
// POST /api/workflows
// Create a new workflow
// =============================================
router.post('/', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const userId = req.userId;
    const { name, description, graph, trigger_type, trigger_config } = req.body;

    // Validate graph structure
    const validatedGraph = graph || { nodes: [], edges: [] };
    if (!Array.isArray(validatedGraph.nodes) || !Array.isArray(validatedGraph.edges)) {
      return res.status(400).json({ error: 'Invalid graph structure' });
    }

    const { data, error } = await supabase
      .from('workflows')
      .insert({
        user_id: userId,
        name: name || 'Untitled Workflow',
        description: description || null,
        graph: validatedGraph,
        trigger_type: trigger_type || 'manual',
        trigger_config: trigger_config || {}
      })
      .select()
      .single();

    if (error) throw error;

    logger.info('Workflow created', { workflowId: data.id, userId, requestId: req.id });

    res.status(201).json({ workflow: data });

  } catch (error) {
    logger.error('Error creating workflow', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Failed to create workflow' });
  }
});

// =============================================
// PUT /api/workflows/:id
// Update a workflow
// =============================================
router.put('/:id', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const userId = req.userId;
    const { id } = req.params;
    const { name, description, graph, is_enabled, trigger_type, trigger_config } = req.body;

    // Build update object with only provided fields
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (graph !== undefined) {
      // Validate graph structure
      if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
        return res.status(400).json({ error: 'Invalid graph structure' });
      }
      updates.graph = graph;
    }
    if (is_enabled !== undefined) updates.is_enabled = is_enabled;
    if (trigger_type !== undefined) updates.trigger_type = trigger_type;
    if (trigger_config !== undefined) updates.trigger_config = trigger_config;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const { data, error } = await supabase
      .from('workflows')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Workflow not found' });
      }
      throw error;
    }

    logger.info('Workflow updated', { workflowId: id, userId, requestId: req.id });

    res.json({ workflow: data });

  } catch (error) {
    logger.error('Error updating workflow', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Failed to update workflow' });
  }
});

// =============================================
// DELETE /api/workflows/:id
// Delete a workflow
// =============================================
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const userId = req.userId;
    const { id } = req.params;

    const { data, error } = await supabase
      .from('workflows')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Workflow not found' });
      }
      throw error;
    }

    logger.info('Workflow deleted', { workflowId: id, userId, requestId: req.id });

    res.json({ success: true, deleted: data });

  } catch (error) {
    logger.error('Error deleting workflow', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Failed to delete workflow' });
  }
});

// =============================================
// POST /api/workflows/:id/execute
// Trigger a workflow execution
// =============================================
router.post('/:id/execute', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const userId = req.userId;
    const { id } = req.params;

    // Get the workflow
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (workflowError || !workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    // Validate workflow has nodes
    if (!workflow.graph?.nodes?.length) {
      return res.status(400).json({ error: 'Workflow has no nodes' });
    }

    // Check user has enough credits (estimate based on nodes)
    const { data: profile } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', userId)
      .single();

    const estimatedCredits = estimateWorkflowCredits(workflow.graph);

    if ((profile?.credits || 0) < estimatedCredits) {
      return res.status(402).json({
        error: 'Insufficient credits',
        required: estimatedCredits,
        available: profile?.credits || 0
      });
    }

    // Create execution record
    const { data: execution, error: execError } = await supabase
      .from('workflow_executions')
      .insert({
        workflow_id: id,
        user_id: userId,
        status: 'pending',
        context: {},
        credits_estimated: estimatedCredits
      })
      .select()
      .single();

    if (execError) throw execError;

    logger.info('Workflow execution started', {
      workflowId: id,
      executionId: execution.id,
      userId,
      requestId: req.id
    });

    // Start execution asynchronously (don't await)
    executeWorkflowById(execution.id, workflow, userId).catch(err => {
      logger.error('Workflow execution failed', {
        executionId: execution.id,
        error: err.message
      });
    });

    res.json({
      success: true,
      execution: {
        id: execution.id,
        status: 'pending',
        credits_estimated: estimatedCredits
      }
    });

  } catch (error) {
    logger.error('Error starting workflow execution', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Failed to start workflow execution' });
  }
});

// =============================================
// GET /api/workflows/:id/executions
// Get execution history for a workflow
// =============================================
router.get('/:id/executions', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const userId = req.userId;
    const { id } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    // Verify workflow belongs to user
    const { data: workflow } = await supabase
      .from('workflows')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    const { data, error } = await supabase
      .from('workflow_executions')
      .select(`
        id,
        status,
        current_node_id,
        error_message,
        error_node_id,
        credits_used,
        credits_estimated,
        created_at,
        started_at,
        completed_at
      `)
      .eq('workflow_id', id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    res.json({ executions: data || [] });

  } catch (error) {
    logger.error('Error fetching executions', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Failed to fetch executions' });
  }
});

// =============================================
// GET /api/workflow-executions/:id
// Get a single execution with step results
// =============================================
router.get('/executions/:id', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const userId = req.userId;
    const { id } = req.params;

    const { data: execution, error } = await supabase
      .from('workflow_executions')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !execution) {
      return res.status(404).json({ error: 'Execution not found' });
    }

    // Get step results
    const { data: steps } = await supabase
      .from('workflow_step_results')
      .select('*')
      .eq('execution_id', id)
      .order('created_at', { ascending: true });

    res.json({
      execution,
      steps: steps || []
    });

  } catch (error) {
    logger.error('Error fetching execution', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Failed to fetch execution' });
  }
});

// =============================================
// HELPER FUNCTIONS
// =============================================

/**
 * Estimate credits needed for a workflow
 */
function estimateWorkflowCredits(graph) {
  let credits = 0;

  for (const node of graph.nodes || []) {
    switch (node.type) {
      case 'generate-prompts':
        credits += 1;
        break;
      case 'generate-image':
        // If connected to generate-prompts, estimate based on prompt count
        const promptCount = node.data?.config?.count || node.data?.config?.num_outputs || 1;
        credits += 5 * promptCount;
        break;
      case 'generate-video':
        credits += 20;
        break;
      case 'generate-caption':
        credits += 1;
        break;
      // Triggers and save-gallery are free
      default:
        break;
    }
  }

  return credits;
}

module.exports = router;

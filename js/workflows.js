/**
 * Workflows Module
 * Visual workflow automation for Digital Divas
 */

(function() {
  'use strict';

  // =============================================
  // STATE
  // =============================================

  let workflows = [];
  let currentWorkflow = null;
  let currentWorkflowId = null;
  let selectedNode = null;
  let nodes = [];
  let edges = [];
  let nodeIdCounter = 0;
  let isDragging = false;
  let dragNode = null;
  let dragOffset = { x: 0, y: 0 };
  let isConnecting = false;
  let connectionStart = null;
  let tempConnection = null;
  let characters = [];

  // Canvas transform state
  let canvasZoom = 1;
  let canvasPan = { x: 0, y: 0 };
  let isPanning = false;
  let panStart = { x: 0, y: 0 };

  // =============================================
  // NODE DEFINITIONS
  // =============================================

  const NODE_TYPES = {
    'manual-trigger': {
      type: 'manual-trigger',
      label: 'Manual Trigger',
      icon: '👆',
      category: 'triggers',
      inputs: [],
      outputs: [{ name: 'trigger', type: 'trigger', label: 'Trigger' }],
      config: []
    },
    'schedule-trigger': {
      type: 'schedule-trigger',
      label: 'Schedule Trigger',
      icon: '⏰',
      category: 'triggers',
      inputs: [],
      outputs: [{ name: 'trigger', type: 'trigger', label: 'Trigger' }],
      config: [
        {
          name: 'frequency',
          type: 'select',
          label: 'How often?',
          options: [
            { value: 'every-few-minutes', label: 'Every few minutes' },
            { value: 'hourly', label: 'Every hour' },
            { value: 'every-few-hours', label: 'Every few hours' },
            { value: 'daily', label: 'Once a day' },
            { value: 'weekly', label: 'Once a week' },
            { value: 'monthly', label: 'Once a month' }
          ],
          default: 'daily'
        },
        {
          name: 'minutes_interval',
          type: 'select',
          label: 'Run every...',
          options: [
            { value: '5', label: '5 minutes' },
            { value: '15', label: '15 minutes' },
            { value: '30', label: '30 minutes' }
          ],
          default: '15',
          showWhen: { frequency: 'every-few-minutes' }
        },
        {
          name: 'hours_interval',
          type: 'select',
          label: 'Run every...',
          options: [
            { value: '2', label: '2 hours' },
            { value: '3', label: '3 hours' },
            { value: '4', label: '4 hours' },
            { value: '6', label: '6 hours' },
            { value: '8', label: '8 hours' },
            { value: '12', label: '12 hours' }
          ],
          default: '6',
          showWhen: { frequency: 'every-few-hours' }
        },
        {
          name: 'time_of_day',
          type: 'select',
          label: 'What time?',
          options: [
            { value: '6', label: '6:00 AM' },
            { value: '7', label: '7:00 AM' },
            { value: '8', label: '8:00 AM' },
            { value: '9', label: '9:00 AM' },
            { value: '10', label: '10:00 AM' },
            { value: '11', label: '11:00 AM' },
            { value: '12', label: '12:00 PM (Noon)' },
            { value: '13', label: '1:00 PM' },
            { value: '14', label: '2:00 PM' },
            { value: '15', label: '3:00 PM' },
            { value: '16', label: '4:00 PM' },
            { value: '17', label: '5:00 PM' },
            { value: '18', label: '6:00 PM' },
            { value: '19', label: '7:00 PM' },
            { value: '20', label: '8:00 PM' },
            { value: '21', label: '9:00 PM' }
          ],
          default: '9',
          showWhen: { frequency: ['daily', 'weekly', 'monthly'] }
        },
        {
          name: 'day_of_week',
          type: 'select',
          label: 'Which day?',
          options: [
            { value: '1', label: 'Monday' },
            { value: '2', label: 'Tuesday' },
            { value: '3', label: 'Wednesday' },
            { value: '4', label: 'Thursday' },
            { value: '5', label: 'Friday' },
            { value: '6', label: 'Saturday' },
            { value: '0', label: 'Sunday' }
          ],
          default: '1',
          showWhen: { frequency: 'weekly' }
        },
        {
          name: 'day_of_month',
          type: 'select',
          label: 'Which day?',
          options: [
            { value: '1', label: '1st of the month' },
            { value: '15', label: '15th of the month' }
          ],
          default: '1',
          showWhen: { frequency: 'monthly' }
        },
        {
          name: 'timezone',
          type: 'select',
          label: 'Timezone',
          options: [
            { value: 'America/New_York', label: 'Eastern (US)' },
            { value: 'America/Chicago', label: 'Central (US)' },
            { value: 'America/Denver', label: 'Mountain (US)' },
            { value: 'America/Los_Angeles', label: 'Pacific (US)' },
            { value: 'Europe/London', label: 'London (UK)' },
            { value: 'Europe/Paris', label: 'Paris (EU)' },
            { value: 'Asia/Tokyo', label: 'Tokyo (Japan)' },
            { value: 'UTC', label: 'UTC' }
          ],
          default: 'America/New_York'
        },
        {
          name: 'is_enabled',
          type: 'toggle',
          label: 'Enable Schedule',
          default: true
        }
      ]
    },
    'generate-prompts': {
      type: 'generate-prompts',
      label: 'Generate Prompts',
      icon: '✨',
      category: 'ai-generation',
      inputs: [{ name: 'trigger', type: 'trigger', label: 'Trigger', required: true }],
      outputs: [{ name: 'prompts', type: 'prompts', label: 'Prompts' }],
      config: [
        {
          name: 'theme',
          type: 'textarea',
          label: 'Theme/Concept',
          placeholder: 'e.g., beach vacation, cyberpunk city, cozy winter cabin...',
          required: true
        },
        {
          name: 'count',
          type: 'select',
          label: 'Number of Prompts',
          options: [
            { value: '3', label: '3 prompts' },
            { value: '5', label: '5 prompts' },
            { value: '10', label: '10 prompts' },
            { value: '15', label: '15 prompts' },
            { value: '20', label: '20 prompts' }
          ],
          default: '5'
        },
        {
          name: 'content_mode',
          type: 'button-group',
          label: 'Content Mode',
          options: [
            { value: 'sfw', label: 'SFW' },
            { value: 'nsfw', label: 'NSFW' }
          ],
          default: 'sfw'
        },
        {
          name: 'style',
          type: 'select',
          label: 'Style',
          options: [
            { value: 'realistic', label: 'Realistic' },
            { value: 'anime', label: 'Anime' },
            { value: 'cinematic', label: 'Cinematic' },
            { value: 'fantasy', label: 'Fantasy' },
            { value: 'glamour', label: 'Glamour' },
            { value: 'artistic', label: 'Artistic' }
          ],
          default: 'realistic'
        },
        {
          name: 'character_id',
          type: 'character-select',
          label: 'Character (optional)'
        },
        {
          name: 'include_poses',
          type: 'toggle',
          label: 'Vary Poses/Actions',
          default: true
        },
        {
          name: 'include_settings',
          type: 'toggle',
          label: 'Vary Settings/Backgrounds',
          default: true
        }
      ]
    },
    'generate-image': {
      type: 'generate-image',
      label: 'Generate Image',
      icon: '🎨',
      category: 'ai-generation',
      inputs: [
        { name: 'trigger', type: 'trigger', label: 'Trigger' },
        { name: 'prompts', type: 'prompts', label: 'Prompts' }
      ],
      outputs: [{ name: 'image_url', type: 'image', label: 'Image' }],
      config: [
        {
          name: 'model',
          type: 'button-group',
          label: 'Model',
          options: [
            { value: 'seedream', label: 'Seedream' },
            { value: 'nano-banana', label: 'Nano Banana' },
            { value: 'qwen', label: 'Qwen' }
          ],
          default: 'seedream'
        },
        {
          name: 'character_id',
          type: 'character-select',
          label: 'Character',
          required: true
        },
        {
          name: 'prompt',
          type: 'textarea',
          label: 'Prompt',
          placeholder: 'Describe the image you want to generate...',
          required: true
        },
        {
          name: 'facelock_enabled',
          type: 'toggle',
          label: 'Enable Face Lock',
          default: true,
          showWhen: { model: ['seedream', 'nano-banana'] }
        },
        {
          name: 'facelock_mode',
          type: 'button-group',
          label: 'Face Lock Mode',
          options: [
            { value: 'sfw', label: 'SFW' },
            { value: 'nsfw', label: 'NSFW' }
          ],
          default: 'sfw',
          showWhen: { facelock_enabled: true, model: ['seedream', 'nano-banana'] }
        },
        {
          name: 'aspect_ratio',
          type: 'select',
          label: 'Aspect Ratio',
          options: [
            { value: '1:1', label: '1:1 Square' },
            { value: '9:16', label: '9:16 Portrait' },
            { value: '16:9', label: '16:9 Landscape' },
            { value: '4:5', label: '4:5 Instagram' }
          ],
          default: '9:16',
          showWhen: { model: 'nano-banana' }
        },
        {
          name: 'width',
          type: 'select',
          label: 'Width',
          options: [
            { value: '512', label: '512' },
            { value: '768', label: '768' },
            { value: '1024', label: '1024' },
            { value: '1152', label: '1152' },
            { value: '1344', label: '1344' }
          ],
          default: '768',
          showWhen: { model: ['seedream', 'qwen'] }
        },
        {
          name: 'height',
          type: 'select',
          label: 'Height',
          options: [
            { value: '512', label: '512' },
            { value: '768', label: '768' },
            { value: '1024', label: '1024' },
            { value: '1152', label: '1152' },
            { value: '1344', label: '1344' },
            { value: '1536', label: '1536' }
          ],
          default: '1344',
          showWhen: { model: ['seedream', 'qwen'] }
        }
      ]
    },
    'save-gallery': {
      type: 'save-gallery',
      label: 'Save to Gallery',
      icon: '💾',
      category: 'output',
      inputs: [{ name: 'image_url', type: 'image', label: 'Image', required: true }],
      outputs: [],
      config: [
        {
          name: 'folder',
          type: 'text',
          label: 'Folder/Tag',
          placeholder: 'workflow',
          default: 'workflow'
        }
      ]
    }
  };

  // =============================================
  // INITIALIZATION
  // =============================================

  function init() {
    // Check if we're on the workflows tab
    const workflowsSection = document.getElementById('workflowsSection');
    if (!workflowsSection) return;

    // Set up event listeners
    setupPaletteHandlers();
    setupCanvasHandlers();

    // Close dropdown menus when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.workflow-card-menu')) {
        document.querySelectorAll('.workflow-card-menu-dropdown.show').forEach(d => d.classList.remove('show'));
      }
    });

    // Load characters for the character select
    loadCharacters();

    console.log('Workflows module initialized');
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // =============================================
  // API FUNCTIONS
  // =============================================

  async function fetchWorkflows() {
    try {
      const response = await authFetch(`${API_BASE_URL}/api/workflows`);
      if (!response.ok) throw new Error('Failed to fetch workflows');
      const data = await response.json();
      workflows = data.workflows || [];
      renderWorkflowsList();
    } catch (error) {
      console.error('Error fetching workflows:', error);
      showToast('Failed to load workflows', 'error');
    }
  }

  async function createWorkflow(name = 'Untitled Workflow') {
    try {
      const response = await authFetch(`${API_BASE_URL}/api/workflows`, {
        method: 'POST',
        body: JSON.stringify({
          name,
          graph: { nodes: [], edges: [] }
        })
      });

      if (!response.ok) throw new Error('Failed to create workflow');
      const data = await response.json();
      return data.workflow;
    } catch (error) {
      console.error('Error creating workflow:', error);
      showToast('Failed to create workflow', 'error');
      return null;
    }
  }

  async function saveWorkflowToServer() {
    if (!currentWorkflowId) return;

    try {
      const nameInput = document.getElementById('workflowNameInput');
      const name = nameInput ? nameInput.value : 'Untitled Workflow';

      const graph = {
        nodes: nodes.map(n => ({
          id: n.id,
          type: n.type,
          position: n.position,
          data: { config: n.config }
        })),
        edges: edges.map(e => ({
          id: e.id,
          source: e.source,
          sourceHandle: e.sourceHandle,
          target: e.target,
          targetHandle: e.targetHandle
        }))
      };

      const response = await authFetch(`${API_BASE_URL}/api/workflows/${currentWorkflowId}`, {
        method: 'PUT',
        body: JSON.stringify({ name, graph })
      });

      if (!response.ok) throw new Error('Failed to save workflow');

      console.log('Workflow saved, now syncing schedule...');

      // Sync schedule if there's a schedule-trigger node
      const scheduleInfo = await syncWorkflowSchedule();
      console.log('scheduleInfo result:', scheduleInfo);

      // Show appropriate success message
      if (scheduleInfo && scheduleInfo.hasSchedule && scheduleInfo.success) {
        const status = scheduleInfo.isEnabled ? 'enabled' : 'paused';
        showToast(`Workflow saved! Schedule ${status}: runs ${scheduleInfo.description}`, 'success');
      } else if (scheduleInfo && scheduleInfo.hasSchedule && !scheduleInfo.success) {
        showToast('Workflow saved, but schedule failed to sync', 'error');
      } else {
        showToast('Workflow saved', 'success');
      }
    } catch (error) {
      console.error('Error saving workflow:', error);
      showToast('Failed to save workflow', 'error');
    }
  }

  // Generate cron expression from friendly schedule options
  function generateCronExpression(config) {
    const frequency = config?.frequency || 'daily';
    const timeOfDay = config?.time_of_day || '9';
    const dayOfWeek = config?.day_of_week || '1';
    const dayOfMonth = config?.day_of_month || '1';
    const hoursInterval = config?.hours_interval || '6';
    const minutesInterval = config?.minutes_interval || '15';

    // Cron format: minute hour day-of-month month day-of-week
    switch (frequency) {
      case 'every-few-minutes':
        return `*/${minutesInterval} * * * *`;  // Every X minutes
      case 'hourly':
        return '0 * * * *';  // Every hour at minute 0
      case 'every-few-hours':
        return `0 */${hoursInterval} * * *`;  // Every X hours
      case 'daily':
        return `0 ${timeOfDay} * * *`;  // Daily at specified hour
      case 'weekly':
        return `0 ${timeOfDay} * * ${dayOfWeek}`;  // Weekly on specified day
      case 'monthly':
        return `0 ${timeOfDay} ${dayOfMonth} * *`;  // Monthly on specified day
      default:
        return '0 9 * * *';  // Default: daily at 9am
    }
  }

  // Get human-readable schedule description
  function getScheduleDescription(config) {
    const frequency = config?.frequency || 'daily';
    const timeOfDay = config?.time_of_day || '9';
    const dayOfWeek = config?.day_of_week || '1';
    const dayOfMonth = config?.day_of_month || '1';
    const hoursInterval = config?.hours_interval || '6';
    const minutesInterval = config?.minutes_interval || '15';

    const timeLabels = {
      '6': '6:00 AM', '7': '7:00 AM', '8': '8:00 AM', '9': '9:00 AM',
      '10': '10:00 AM', '11': '11:00 AM', '12': '12:00 PM', '13': '1:00 PM',
      '14': '2:00 PM', '15': '3:00 PM', '16': '4:00 PM', '17': '5:00 PM',
      '18': '6:00 PM', '19': '7:00 PM', '20': '8:00 PM', '21': '9:00 PM'
    };
    const dayLabels = {
      '0': 'Sunday', '1': 'Monday', '2': 'Tuesday', '3': 'Wednesday',
      '4': 'Thursday', '5': 'Friday', '6': 'Saturday'
    };

    switch (frequency) {
      case 'every-few-minutes':
        return `every ${minutesInterval} minutes`;
      case 'hourly':
        return 'every hour';
      case 'every-few-hours':
        return `every ${hoursInterval} hours`;
      case 'daily':
        return `daily at ${timeLabels[timeOfDay] || timeOfDay}`;
      case 'weekly':
        return `every ${dayLabels[dayOfWeek]} at ${timeLabels[timeOfDay] || timeOfDay}`;
      case 'monthly':
        return `monthly on the ${dayOfMonth}${dayOfMonth === '1' ? 'st' : 'th'} at ${timeLabels[timeOfDay] || timeOfDay}`;
      default:
        return 'daily at 9:00 AM';
    }
  }

  async function syncWorkflowSchedule() {
    if (!currentWorkflowId) {
      console.log('syncWorkflowSchedule: No currentWorkflowId');
      return null;
    }

    // Find schedule-trigger node
    const scheduleNode = nodes.find(n => n.type === 'schedule-trigger');
    console.log('syncWorkflowSchedule: scheduleNode found?', !!scheduleNode, scheduleNode?.type);
    console.log('syncWorkflowSchedule: all node types:', nodes.map(n => n.type));

    try {
      // Check if schedule exists for this workflow
      const checkResponse = await authFetch(`${API_BASE_URL}/api/workflow-schedules/workflow/${currentWorkflowId}`);
      if (!checkResponse.ok) {
        console.error('syncWorkflowSchedule: check endpoint failed', checkResponse.status);
        const errText = await checkResponse.text();
        console.error('syncWorkflowSchedule: check error', errText);
        return null;
      }
      const checkData = await checkResponse.json();
      const existingSchedule = checkData.schedule;
      console.log('syncWorkflowSchedule: existingSchedule?', !!existingSchedule);

      if (scheduleNode) {
        // Generate cron expression from friendly options
        const cronExpression = generateCronExpression(scheduleNode.config);
        console.log('syncWorkflowSchedule: cronExpression', cronExpression);
        console.log('syncWorkflowSchedule: scheduleNode.config', scheduleNode.config);

        const timezone = scheduleNode.config?.timezone || 'America/New_York';
        const isEnabled = scheduleNode.config?.is_enabled !== false;

        let success = false;

        if (existingSchedule) {
          // Update existing schedule
          const updateResponse = await authFetch(`${API_BASE_URL}/api/workflow-schedules/${existingSchedule.id}`, {
            method: 'PUT',
            body: JSON.stringify({
              cron_expression: cronExpression,
              timezone,
              is_enabled: isEnabled
            })
          });
          console.log('syncWorkflowSchedule: update response', updateResponse.status);
          if (!updateResponse.ok) {
            const errData = await updateResponse.json();
            console.error('syncWorkflowSchedule: update failed', errData);
            showToast(`Schedule update failed: ${errData.error || 'Unknown error'}`, 'error');
          } else {
            success = true;
          }
        } else {
          // Create new schedule
          console.log('syncWorkflowSchedule: creating new schedule for workflow', currentWorkflowId);
          const requestBody = {
            workflow_id: currentWorkflowId,
            cron_expression: cronExpression,
            timezone,
            is_enabled: isEnabled
          };
          console.log('syncWorkflowSchedule: POST body', JSON.stringify(requestBody));

          const createResponse = await authFetch(`${API_BASE_URL}/api/workflow-schedules`, {
            method: 'POST',
            body: JSON.stringify(requestBody)
          });
          console.log('syncWorkflowSchedule: create response', createResponse.status);
          if (!createResponse.ok) {
            const errData = await createResponse.json();
            console.error('syncWorkflowSchedule: create failed', errData);
            showToast(`Schedule creation failed: ${errData.error || 'Unknown error'}`, 'error');
          } else {
            success = true;
            const resultData = await createResponse.json();
            console.log('syncWorkflowSchedule: schedule created', resultData);
          }
        }

        // Return schedule info for confirmation message
        return {
          hasSchedule: true,
          isEnabled,
          success,
          description: getScheduleDescription(scheduleNode.config)
        };
      } else if (existingSchedule) {
        // No schedule node but schedule exists - delete it
        await authFetch(`${API_BASE_URL}/api/workflow-schedules/${existingSchedule.id}`, {
          method: 'DELETE'
        });
      }

      return { hasSchedule: false };
    } catch (error) {
      console.error('Error syncing schedule:', error);
      showToast(`Schedule sync error: ${error.message}`, 'error');
      return null;
    }
  }

  async function loadWorkflow(workflowId) {
    try {
      const response = await authFetch(`${API_BASE_URL}/api/workflows/${workflowId}`);
      if (!response.ok) throw new Error('Failed to load workflow');
      const data = await response.json();
      return data.workflow;
    } catch (error) {
      console.error('Error loading workflow:', error);
      showToast('Failed to load workflow', 'error');
      return null;
    }
  }

  async function deleteWorkflow(workflowId) {
    try {
      const response = await authFetch(`${API_BASE_URL}/api/workflows/${workflowId}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to delete workflow');
      return true;
    } catch (error) {
      console.error('Error deleting workflow:', error);
      showToast('Failed to delete workflow', 'error');
      return false;
    }
  }

  async function executeWorkflow(workflowId) {
    try {
      const response = await authFetch(`${API_BASE_URL}/api/workflows/${workflowId}/execute`, {
        method: 'POST'
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to execute workflow');
      }

      const data = await response.json();
      showExecutionStatus(data.execution);
      return data.execution;
    } catch (error) {
      console.error('Error executing workflow:', error);
      showToast(error.message || 'Failed to execute workflow', 'error');
      return null;
    }
  }

  async function loadCharacters() {
    try {
      const response = await authFetch(`${API_BASE_URL}/api/characters`);
      if (response.ok) {
        const data = await response.json();
        characters = data.characters || [];
      }
    } catch (error) {
      console.error('Error loading characters:', error);
    }
  }

  // =============================================
  // UI RENDERING
  // =============================================

  function renderWorkflowsList() {
    const grid = document.getElementById('workflowsGrid');
    const empty = document.getElementById('workflowsEmpty');

    if (!grid) return;

    if (workflows.length === 0) {
      empty.style.display = 'flex';
      // Clear any existing cards
      Array.from(grid.children).forEach(child => {
        if (child !== empty) child.remove();
      });
      return;
    }

    empty.style.display = 'none';

    // Clear existing cards (except empty state)
    Array.from(grid.children).forEach(child => {
      if (child !== empty) child.remove();
    });

    // Render workflow cards
    workflows.forEach(workflow => {
      const card = document.createElement('div');
      card.className = 'workflow-card';

      const hasSchedule = workflow.schedule !== null;
      const scheduleEnabled = workflow.schedule?.is_enabled ?? false;

      // Format next run time if available
      let nextRunText = '';
      if (hasSchedule && workflow.schedule.next_run_at) {
        const nextRun = new Date(workflow.schedule.next_run_at);
        nextRunText = `Next: ${nextRun.toLocaleDateString()} ${nextRun.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }

      card.innerHTML = `
        <div class="workflow-card-header">
          <h3 class="workflow-card-name">${escapeHtml(workflow.name)}</h3>
          <div class="workflow-card-header-actions">
            ${hasSchedule ? `
              <label class="workflow-schedule-toggle" title="${scheduleEnabled ? 'Schedule active' : 'Schedule paused'}">
                <input type="checkbox" ${scheduleEnabled ? 'checked' : ''}
                       onchange="window.workflowsModule.toggleSchedule('${workflow.id}', '${workflow.schedule.id}', this.checked)">
                <span class="workflow-schedule-slider"></span>
              </label>
            ` : ''}
            <div class="workflow-card-menu">
              <button class="workflow-card-menu-btn" onclick="window.workflowsModule.toggleCardMenu(this)" title="More options">
                ⋮
              </button>
              <div class="workflow-card-menu-dropdown">
                <button class="workflow-card-menu-item delete" onclick="window.workflowsModule.confirmDeleteWorkflow('${workflow.id}', '${escapeHtml(workflow.name).replace(/'/g, "\\'")}')">
                  🗑️ Delete
                </button>
              </div>
            </div>
          </div>
        </div>
        <div class="workflow-card-meta">
          ${hasSchedule ? `
            <span class="workflow-schedule-badge ${scheduleEnabled ? 'active' : 'paused'}">
              ⏰ ${scheduleEnabled ? 'Scheduled' : 'Paused'}
            </span>
            ${scheduleEnabled && nextRunText ? `<span class="workflow-next-run">${nextRunText}</span>` : ''}
          ` : 'Manual trigger'}
        </div>
        <div class="workflow-card-stats">
          <span>${workflow.stats?.total_runs || 0} runs</span>
          <span>${workflow.stats?.successful_runs || 0} successful</span>
        </div>
        <div class="workflow-card-actions">
          <button class="workflow-card-btn" onclick="window.workflowsModule.editWorkflow('${workflow.id}')">Edit</button>
          <button class="workflow-card-btn primary" onclick="window.workflowsModule.runWorkflow('${workflow.id}')">
            <span>▶</span> Run
          </button>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  function renderCanvas() {
    const canvas = document.getElementById('workflowsCanvas');
    const hint = document.getElementById('workflowsCanvasHint');

    if (!canvas) return;

    // Clear canvas
    canvas.innerHTML = '';

    // Show/hide hint
    if (hint) {
      hint.style.display = nodes.length === 0 ? 'block' : 'none';
    }

    // Create SVG for connections
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.pointerEvents = 'none';
    svg.id = 'workflowsConnectionsSvg';
    canvas.appendChild(svg);

    // Render nodes FIRST so handles exist in DOM
    nodes.forEach(node => {
      renderNode(canvas, node);
    });

    // Render connections AFTER nodes exist
    renderConnections(svg);
  }

  function renderNode(canvas, node) {
    const nodeDef = NODE_TYPES[node.type];
    if (!nodeDef) return;

    const nodeEl = document.createElement('div');
    nodeEl.className = `workflow-node ${selectedNode?.id === node.id ? 'selected' : ''}`;
    nodeEl.id = `node-${node.id}`;
    nodeEl.style.left = `${node.position.x}px`;
    nodeEl.style.top = `${node.position.y}px`;

    // Build summary text
    let summaryItems = [];
    if (node.config?.model) summaryItems.push(node.config.model);
    if (node.config?.character_id) {
      const char = characters.find(c => c.id === node.config.character_id);
      if (char) summaryItems.push(char.name);
    }
    if (node.config?.facelock_enabled) summaryItems.push('🔒');

    nodeEl.innerHTML = `
      <div class="workflow-node-header">
        <span class="workflow-node-icon">${nodeDef.icon}</span>
        <span class="workflow-node-title">${nodeDef.label}</span>
      </div>
      <div class="workflow-node-body">
        ${summaryItems.length > 0 ? `
          <div class="workflow-node-summary">
            ${summaryItems.map(item => `<span class="workflow-node-summary-item">${escapeHtml(item)}</span>`).join('')}
          </div>
        ` : `<span style="color: var(--text-tertiary)">Click to configure</span>`}
      </div>
      <div class="workflow-node-handles">
        ${nodeDef.inputs.map(input => `
          <div class="workflow-node-handle input"
               data-node-id="${node.id}"
               data-handle="${input.name}"
               data-type="${input.type}"></div>
        `).join('')}
        ${nodeDef.outputs.map(output => `
          <div class="workflow-node-handle output"
               data-node-id="${node.id}"
               data-handle="${output.name}"
               data-type="${output.type}"></div>
        `).join('')}
      </div>
    `;

    // Add event listeners
    nodeEl.addEventListener('mousedown', (e) => startNodeDrag(e, node));
    nodeEl.addEventListener('click', (e) => {
      e.stopPropagation();
      selectNode(node);
    });

    // Handle connection events
    const handles = nodeEl.querySelectorAll('.workflow-node-handle');
    handles.forEach(handle => {
      handle.addEventListener('mousedown', (e) => startConnection(e, handle));
    });

    canvas.appendChild(nodeEl);
  }

  function renderConnections(svg) {
    svg.innerHTML = '';

    edges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);

      if (!sourceNode || !targetNode) return;

      // Get actual handle elements
      const sourceHandle = document.querySelector(`#node-${edge.source} .workflow-node-handle.output[data-handle="${edge.sourceHandle}"]`);
      const targetHandle = document.querySelector(`#node-${edge.target} .workflow-node-handle.input[data-handle="${edge.targetHandle}"]`);

      let sourceX, sourceY, targetX, targetY;

      if (sourceHandle && targetHandle) {
        // Get positions relative to canvas, accounting for zoom
        const canvas = document.getElementById('workflowsCanvas');
        const canvasRect = canvas.getBoundingClientRect();
        const sourceRect = sourceHandle.getBoundingClientRect();
        const targetRect = targetHandle.getBoundingClientRect();

        // Convert screen coordinates to canvas coordinates by dividing by zoom
        sourceX = (sourceRect.left - canvasRect.left + sourceRect.width / 2) / canvasZoom;
        sourceY = (sourceRect.top - canvasRect.top + sourceRect.height / 2) / canvasZoom;
        targetX = (targetRect.left - canvasRect.left + targetRect.width / 2) / canvasZoom;
        targetY = (targetRect.top - canvasRect.top + targetRect.height / 2) / canvasZoom;
      } else {
        // Fallback to node positions if handles not found
        const sourceNodeEl = document.getElementById(`node-${edge.source}`);
        const targetNodeEl = document.getElementById(`node-${edge.target}`);

        const sourceWidth = sourceNodeEl ? sourceNodeEl.offsetWidth : 180;
        const sourceHeight = sourceNodeEl ? sourceNodeEl.offsetHeight : 80;
        const targetHeight = targetNodeEl ? targetNodeEl.offsetHeight : 80;

        sourceX = sourceNode.position.x + sourceWidth;
        sourceY = sourceNode.position.y + sourceHeight / 2;
        targetX = targetNode.position.x;
        targetY = targetNode.position.y + targetHeight / 2;
      }

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

      // Create smooth bezier curve
      const dx = Math.abs(targetX - sourceX);
      const controlOffset = Math.max(50, dx * 0.4);
      const d = `M ${sourceX} ${sourceY} C ${sourceX + controlOffset} ${sourceY}, ${targetX - controlOffset} ${targetY}, ${targetX} ${targetY}`;

      path.setAttribute('d', d);
      path.setAttribute('class', 'workflow-connection');

      svg.appendChild(path);
    });
  }

  function renderNodeConfig(node) {
    const panel = document.getElementById('workflowsConfigPanel');
    const title = document.getElementById('workflowsConfigTitle');
    const body = document.getElementById('workflowsConfigBody');

    if (!panel || !body) return;

    const nodeDef = NODE_TYPES[node.type];
    if (!nodeDef) return;

    panel.style.display = 'flex';
    title.textContent = `Configure: ${nodeDef.label}`;

    // Build config form
    let html = '';

    nodeDef.config.forEach(field => {
      // Check showWhen conditions
      if (field.showWhen) {
        let show = true;
        for (const [key, value] of Object.entries(field.showWhen)) {
          const configValue = node.config[key];
          // Support array values (show if configValue matches any value in array)
          if (Array.isArray(value)) {
            if (!value.includes(configValue)) {
              show = false;
              break;
            }
          } else if (configValue !== value) {
            show = false;
            break;
          }
        }
        if (!show) return;
      }

      const currentValue = node.config[field.name] !== undefined ? node.config[field.name] : field.default;

      html += `<div class="workflows-config-field" data-field="${field.name}">`;
      html += `<label class="workflows-config-label">${field.label}</label>`;

      switch (field.type) {
        case 'text':
        case 'number':
          html += `<input type="${field.type}"
                          class="workflows-config-input"
                          data-field="${field.name}"
                          value="${escapeHtml(currentValue || '')}"
                          placeholder="${field.placeholder || ''}">`;
          break;

        case 'textarea':
          html += `<textarea class="workflows-config-textarea"
                             data-field="${field.name}"
                             placeholder="${field.placeholder || ''}">${escapeHtml(currentValue || '')}</textarea>`;
          break;

        case 'select':
          html += `<select class="workflows-config-select" data-field="${field.name}">`;
          field.options.forEach(opt => {
            const optValue = typeof opt === 'object' ? opt.value : opt;
            const optLabel = typeof opt === 'object' ? opt.label : opt;
            html += `<option value="${optValue}" ${currentValue === optValue ? 'selected' : ''}>${optLabel}</option>`;
          });
          html += `</select>`;
          break;

        case 'button-group':
          html += `<div class="workflows-config-btn-group">`;
          field.options.forEach(opt => {
            html += `<button class="workflows-config-btn-option ${currentValue === opt.value ? 'active' : ''}"
                             data-field="${field.name}"
                             data-value="${opt.value}">${opt.label}</button>`;
          });
          html += `</div>`;
          break;

        case 'toggle':
          html += `<div class="workflows-config-toggle">
                     <span>${field.label}</span>
                     <div class="workflows-config-toggle-switch ${currentValue ? 'active' : ''}"
                          data-field="${field.name}"></div>
                   </div>`;
          break;

        case 'character-select':
          html += `<select class="workflows-config-select" data-field="${field.name}">
                     <option value="">Select a character...</option>`;
          characters.forEach(char => {
            html += `<option value="${char.id}" ${currentValue === char.id ? 'selected' : ''}>${escapeHtml(char.name)}</option>`;
          });
          html += `</select>`;
          break;
      }

      html += `</div>`;
    });

    // Add delete button
    html += `<div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border-color);">
               <button class="workflows-config-delete-btn" onclick="window.workflowsModule.deleteSelectedNode()"
                       style="width: 100%; padding: 10px; background: rgba(255,68,68,0.1); border: 1px solid #ff4444;
                              border-radius: 6px; color: #ff4444; cursor: pointer;">
                 Delete Node
               </button>
             </div>`;

    body.innerHTML = html;

    // Add event listeners for inputs
    body.querySelectorAll('.workflows-config-input, .workflows-config-textarea, .workflows-config-select').forEach(input => {
      input.addEventListener('change', (e) => updateNodeConfig(node, e.target.dataset.field, e.target.value, true));
      input.addEventListener('input', (e) => {
        if (e.target.tagName === 'TEXTAREA' || e.target.type === 'text') {
          // For text inputs, just update the value without re-rendering (keeps focus)
          updateNodeConfig(node, e.target.dataset.field, e.target.value, false);
        }
      });
    });

    body.querySelectorAll('.workflows-config-btn-option').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const field = e.target.dataset.field;
        const value = e.target.dataset.value;

        // Update UI
        e.target.parentElement.querySelectorAll('.workflows-config-btn-option').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');

        updateNodeConfig(node, field, value);
      });
    });

    body.querySelectorAll('.workflows-config-toggle-switch').forEach(toggle => {
      toggle.addEventListener('click', (e) => {
        const field = e.target.dataset.field;
        const newValue = !e.target.classList.contains('active');
        e.target.classList.toggle('active');
        updateNodeConfig(node, field, newValue);
      });
    });
  }

  // =============================================
  // EVENT HANDLERS
  // =============================================

  function setupPaletteHandlers() {
    const paletteNodes = document.querySelectorAll('.workflows-palette-node');

    paletteNodes.forEach(paletteNode => {
      paletteNode.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('nodeType', paletteNode.dataset.nodeType);
      });
    });
  }

  function setupCanvasHandlers() {
    const canvasContainer = document.getElementById('workflowsCanvasContainer');
    const canvas = document.getElementById('workflowsCanvas');

    if (!canvasContainer || !canvas) return;

    // Handle drop from palette
    canvasContainer.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    canvasContainer.addEventListener('drop', (e) => {
      e.preventDefault();
      const nodeType = e.dataTransfer.getData('nodeType');
      if (!nodeType || !NODE_TYPES[nodeType]) return;

      const rect = canvasContainer.getBoundingClientRect();
      // Account for zoom and pan when placing new nodes
      const x = (e.clientX - rect.left - canvasPan.x) / canvasZoom;
      const y = (e.clientY - rect.top - canvasPan.y) / canvasZoom;

      addNode(nodeType, { x, y });
    });

    // Handle canvas click (deselect)
    canvas.addEventListener('click', (e) => {
      if (e.target === canvas || e.target.tagName === 'svg') {
        deselectNode();
      }
    });

    // Handle mouse move for dragging and connecting
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // Handle zoom with mouse wheel
    canvasContainer.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Zoom in/out
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.min(Math.max(canvasZoom * zoomFactor, 0.25), 2);

      // Adjust pan to zoom toward mouse position
      const zoomRatio = newZoom / canvasZoom;
      canvasPan.x = mouseX - (mouseX - canvasPan.x) * zoomRatio;
      canvasPan.y = mouseY - (mouseY - canvasPan.y) * zoomRatio;

      canvasZoom = newZoom;
      applyCanvasTransform();
    }, { passive: false });

    // Handle pan with middle mouse button or space+drag
    canvasContainer.addEventListener('mousedown', (e) => {
      // Middle mouse button (button 1) or if space is held
      if (e.button === 1) {
        e.preventDefault();
        isPanning = true;
        panStart = { x: e.clientX - canvasPan.x, y: e.clientY - canvasPan.y };
        canvasContainer.style.cursor = 'grabbing';
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.repeat && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        const canvasContainer = document.getElementById('workflowsCanvasContainer');
        if (canvasContainer) canvasContainer.style.cursor = 'grab';
      }
    });

    document.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        const canvasContainer = document.getElementById('workflowsCanvasContainer');
        if (canvasContainer) canvasContainer.style.cursor = 'default';
        isPanning = false;
      }
    });
  }

  function applyCanvasTransform() {
    const canvas = document.getElementById('workflowsCanvas');
    if (canvas) {
      canvas.style.transform = `translate(${canvasPan.x}px, ${canvasPan.y}px) scale(${canvasZoom})`;
      canvas.style.transformOrigin = '0 0';
    }
    // Update zoom display
    const zoomLevel = document.getElementById('workflowsZoomLevel');
    if (zoomLevel) {
      zoomLevel.textContent = `${Math.round(canvasZoom * 100)}%`;
    }
  }

  function handleMouseMove(e) {
    // Handle panning
    if (isPanning) {
      canvasPan.x = e.clientX - panStart.x;
      canvasPan.y = e.clientY - panStart.y;
      applyCanvasTransform();
      return;
    }

    if (isDragging && dragNode) {
      const canvasContainer = document.getElementById('workflowsCanvasContainer');
      const rect = canvasContainer.getBoundingClientRect();

      // Account for zoom and pan when calculating position
      dragNode.position.x = (e.clientX - rect.left - canvasPan.x) / canvasZoom - dragOffset.x;
      dragNode.position.y = (e.clientY - rect.top - canvasPan.y) / canvasZoom - dragOffset.y;

      // Update node position
      const nodeEl = document.getElementById(`node-${dragNode.id}`);
      if (nodeEl) {
        nodeEl.style.left = `${dragNode.position.x}px`;
        nodeEl.style.top = `${dragNode.position.y}px`;
      }

      // Update connections
      const svg = document.getElementById('workflowsConnectionsSvg');
      if (svg) renderConnections(svg);
    }

    // Draw preview wire while connecting
    if (isConnecting && connectionStart) {
      const canvas = document.getElementById('workflowsCanvas');
      const svg = document.getElementById('workflowsConnectionsSvg');
      if (!canvas || !svg) return;

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Get source handle position
      const sourceHandle = document.querySelector(`#node-${connectionStart.nodeId} .workflow-node-handle.output[data-handle="${connectionStart.handle}"]`);
      let sourceX, sourceY;

      if (sourceHandle) {
        const handleRect = sourceHandle.getBoundingClientRect();
        sourceX = handleRect.left - rect.left + handleRect.width / 2;
        sourceY = handleRect.top - rect.top + handleRect.height / 2;
      } else {
        // Fallback
        const sourceNode = nodes.find(n => n.id === connectionStart.nodeId);
        if (!sourceNode) return;
        sourceX = sourceNode.position.x + 180;
        sourceY = sourceNode.position.y + 40;
      }

      // Remove old preview line
      const oldPreview = svg.querySelector('.connection-preview');
      if (oldPreview) oldPreview.remove();

      // Draw preview line
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const dx = Math.abs(mouseX - sourceX);
      const controlOffset = Math.max(50, dx * 0.4);
      const d = `M ${sourceX} ${sourceY} C ${sourceX + controlOffset} ${sourceY}, ${mouseX - controlOffset} ${mouseY}, ${mouseX} ${mouseY}`;

      path.setAttribute('d', d);
      path.setAttribute('class', 'workflow-connection connection-preview');
      path.setAttribute('stroke', 'var(--accent-color)');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('stroke-dasharray', '5,5');
      path.setAttribute('fill', 'none');
      path.setAttribute('opacity', '0.6');

      svg.appendChild(path);
    }
  }

  function handleMouseUp(e) {
    if (isPanning) {
      isPanning = false;
      const canvasContainer = document.getElementById('workflowsCanvasContainer');
      if (canvasContainer) canvasContainer.style.cursor = 'default';
    }

    if (isDragging) {
      isDragging = false;
      dragNode = null;
    }

    if (isConnecting) {
      // Remove preview line
      const svg = document.getElementById('workflowsConnectionsSvg');
      const preview = svg?.querySelector('.connection-preview');
      if (preview) preview.remove();

      // Check if we dropped on a handle
      const target = e.target;
      if (target.classList.contains('workflow-node-handle')) {
        completeConnection(target);
      }
      isConnecting = false;
      connectionStart = null;
    }
  }

  function startNodeDrag(e, node) {
    if (e.target.classList.contains('workflow-node-handle')) return;

    isDragging = true;
    dragNode = node;

    const nodeEl = document.getElementById(`node-${node.id}`);
    const rect = nodeEl.getBoundingClientRect();

    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
  }

  function startConnection(e, handle) {
    e.stopPropagation();

    // Only allow starting from output handles
    if (!handle.classList.contains('output')) return;

    isConnecting = true;
    connectionStart = {
      nodeId: handle.dataset.nodeId,
      handle: handle.dataset.handle,
      type: handle.dataset.type
    };
  }

  function completeConnection(targetHandle) {
    if (!connectionStart) return;

    // Only allow connecting to input handles
    if (!targetHandle.classList.contains('input')) return;

    const targetNodeId = targetHandle.dataset.nodeId;
    const targetHandleName = targetHandle.dataset.handle;
    const targetType = targetHandle.dataset.type;

    // Validate connection types match
    if (connectionStart.type !== targetType) {
      showToast('Cannot connect different types', 'error');
      return;
    }

    // Don't allow self-connections
    if (connectionStart.nodeId === targetNodeId) return;

    // Check if connection already exists
    const exists = edges.some(e =>
      e.source === connectionStart.nodeId &&
      e.sourceHandle === connectionStart.handle &&
      e.target === targetNodeId &&
      e.targetHandle === targetHandleName
    );

    if (exists) return;

    // Add edge
    edges.push({
      id: `edge-${Date.now()}`,
      source: connectionStart.nodeId,
      sourceHandle: connectionStart.handle,
      target: targetNodeId,
      targetHandle: targetHandleName
    });

    renderCanvas();
  }

  // =============================================
  // NODE OPERATIONS
  // =============================================

  function addNode(type, position) {
    const nodeDef = NODE_TYPES[type];
    if (!nodeDef) return;

    const node = {
      id: `node-${++nodeIdCounter}`,
      type,
      position,
      config: {}
    };

    // Set default config values
    nodeDef.config.forEach(field => {
      if (field.default !== undefined) {
        node.config[field.name] = field.default;
      }
    });

    nodes.push(node);
    renderCanvas();
    selectNode(node);
  }

  function selectNode(node) {
    selectedNode = node;
    renderCanvas();
    renderNodeConfig(node);
  }

  function deselectNode() {
    selectedNode = null;
    const panel = document.getElementById('workflowsConfigPanel');
    if (panel) panel.style.display = 'none';
    renderCanvas();
  }

  function deleteNode(nodeId) {
    // Remove node
    nodes = nodes.filter(n => n.id !== nodeId);

    // Remove connected edges
    edges = edges.filter(e => e.source !== nodeId && e.target !== nodeId);

    if (selectedNode?.id === nodeId) {
      deselectNode();
    }

    renderCanvas();
  }

  function updateNodeConfig(node, field, value, shouldRerender = true) {
    node.config[field] = value;

    if (shouldRerender) {
      // Re-render config panel to handle showWhen conditions
      renderNodeConfig(node);

      // Update node display
      renderCanvas();
    }
  }

  // =============================================
  // WORKFLOW OPERATIONS
  // =============================================

  function openWorkflowEditor(workflow) {
    currentWorkflow = workflow;
    currentWorkflowId = workflow.id;

    // Load graph
    const graph = workflow.graph || { nodes: [], edges: [] };
    nodes = (graph.nodes || []).map(n => ({
      id: n.id,
      type: n.type,
      position: n.position || { x: 100, y: 100 },
      config: n.data?.config || {}
    }));
    edges = graph.edges || [];

    // Update node ID counter
    nodeIdCounter = nodes.length;

    // Set name
    const nameInput = document.getElementById('workflowNameInput');
    if (nameInput) nameInput.value = workflow.name || 'Untitled Workflow';

    // Show editor
    const listView = document.getElementById('workflowsListView');
    const editorView = document.getElementById('workflowsEditorView');

    if (listView) listView.style.display = 'none';
    if (editorView) editorView.style.display = 'flex';

    renderCanvas();
  }

  function closeEditor() {
    currentWorkflow = null;
    currentWorkflowId = null;
    nodes = [];
    edges = [];
    selectedNode = null;

    const listView = document.getElementById('workflowsListView');
    const editorView = document.getElementById('workflowsEditorView');

    if (listView) listView.style.display = 'block';
    if (editorView) editorView.style.display = 'none';

    // Refresh list
    fetchWorkflows();
  }

  // =============================================
  // EXECUTION STATUS
  // =============================================

  function showExecutionStatus(execution) {
    // Remove existing status
    const existing = document.querySelector('.workflow-execution-status');
    if (existing) existing.remove();

    const status = document.createElement('div');
    status.className = 'workflow-execution-status';
    status.innerHTML = `
      <div class="workflow-execution-header">
        <span class="workflow-execution-title">Running Workflow...</span>
        <button class="workflow-execution-close" onclick="this.parentElement.parentElement.remove()">✕</button>
      </div>
      <div class="workflow-execution-steps" id="executionSteps">
        <div class="workflow-execution-step running">
          <span class="workflow-execution-step-icon">⏳</span>
          <span>Starting...</span>
        </div>
      </div>
      <div class="workflow-execution-results" id="executionResults" style="display: none;">
      </div>
    `;

    document.body.appendChild(status);

    // Poll for status updates
    pollExecutionStatus(execution.id);
  }

  async function pollExecutionStatus(executionId) {
    const stepsEl = document.getElementById('executionSteps');
    if (!stepsEl) return;

    try {
      const response = await authFetch(`${API_BASE_URL}/api/workflows/executions/${executionId}`);
      if (!response.ok) throw new Error('Failed to fetch status');

      const data = await response.json();
      const execution = data.execution;
      const steps = data.steps || [];

      // Update UI
      let html = '';
      steps.forEach(step => {
        const statusClass = step.status === 'completed' ? 'completed' :
                           step.status === 'failed' ? 'failed' :
                           step.status === 'running' ? 'running' : '';
        const icon = step.status === 'completed' ? '✓' :
                     step.status === 'failed' ? '✕' :
                     step.status === 'running' ? '⏳' : '○';

        html += `<div class="workflow-execution-step ${statusClass}">
                   <span class="workflow-execution-step-icon">${icon}</span>
                   <span>${step.node_type}</span>
                 </div>`;
      });

      if (execution.status === 'running') {
        html += `<div class="workflow-execution-step running">
                   <span class="workflow-execution-step-icon">⏳</span>
                   <span>Processing...</span>
                 </div>`;
      }

      stepsEl.innerHTML = html;

      // Continue polling if still running
      if (execution.status === 'running' || execution.status === 'pending') {
        setTimeout(() => pollExecutionStatus(executionId), 2000);
      } else {
        // Update header
        const header = document.querySelector('.workflow-execution-title');
        if (header) {
          header.textContent = execution.status === 'completed' ? 'Workflow Complete!' :
                               execution.status === 'failed' ? 'Workflow Failed' : 'Workflow Finished';
        }

        if (execution.status === 'completed') {
          showToast('Workflow completed successfully!', 'success');
          // Show generated images
          showExecutionResults(steps);
        } else if (execution.status === 'failed') {
          showToast(execution.error_message || 'Workflow failed', 'error');
        }
      }

    } catch (error) {
      console.error('Error polling execution status:', error);
    }
  }

  function showExecutionResults(steps) {
    const resultsEl = document.getElementById('executionResults');
    if (!resultsEl) return;

    // Collect prompts from generate-prompts step
    let prompts = [];
    steps.forEach(step => {
      if (step.node_type === 'generate-prompts' && step.output_data?.prompts) {
        prompts = step.output_data.prompts;
      }
    });

    // Collect all images from steps
    const images = [];
    steps.forEach(step => {
      if (step.output_data) {
        // Check for saved_urls (from save-gallery)
        if (step.output_data.saved_urls && Array.isArray(step.output_data.saved_urls)) {
          images.push(...step.output_data.saved_urls);
        }
        // Check for image_urls (from generate-image)
        else if (step.output_data.image_urls && Array.isArray(step.output_data.image_urls)) {
          images.push(...step.output_data.image_urls);
        }
        // Check for single image_url
        else if (step.output_data.image_url) {
          images.push(step.output_data.image_url);
        }
      }
    });

    if (images.length === 0 && prompts.length === 0) {
      resultsEl.style.display = 'none';
      return;
    }

    resultsEl.style.display = 'block';

    let html = '';

    // Show prompts if available
    if (prompts.length > 0) {
      html += `
        <div class="workflow-results-section">
          <div class="workflow-results-title">Generated Prompts (${prompts.length})</div>
          <div class="workflow-prompts-list">
            ${prompts.map((p, i) => `
              <div class="workflow-prompt-item">
                <span class="workflow-prompt-number">${i + 1}</span>
                <span class="workflow-prompt-text">${escapeHtml(p)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Show images if available
    if (images.length > 0) {
      html += `
        <div class="workflow-results-section">
          <div class="workflow-results-title">Generated Images (${images.length})</div>
          <div class="workflow-results-grid">
            ${images.map(url => `
              <div class="workflow-result-image">
                <img src="${escapeHtml(url)}" alt="Generated image" onclick="showImageModal('${escapeHtml(url).replace(/'/g, "\\'")}')">
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    resultsEl.innerHTML = html;
  }

  // =============================================
  // UTILITY FUNCTIONS
  // =============================================

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function showToast(message, type = 'info') {
    // Create toast container if it doesn't exist
    let container = document.getElementById('workflows-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'workflows-toast-container';
      container.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        display: flex;
        flex-direction: column;
        gap: 10px;
      `;
      document.body.appendChild(container);
    }

    // Create toast element
    const toast = document.createElement('div');
    const bgColor = type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#3b82f6';
    toast.style.cssText = `
      background: ${bgColor};
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      animation: slideIn 0.3s ease;
      max-width: 400px;
    `;
    toast.textContent = message;

    // Add animation styles if not already added
    if (!document.getElementById('toast-styles')) {
      const style = document.createElement('style');
      style.id = 'toast-styles';
      style.textContent = `
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(100%); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    container.appendChild(toast);

    // Remove after 4 seconds
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // =============================================
  // PUBLIC API
  // =============================================

  window.workflowsModule = {
    init,
    fetchWorkflows,

    editWorkflow: async function(workflowId) {
      const workflow = await loadWorkflow(workflowId);
      if (workflow) {
        openWorkflowEditor(workflow);
      }
    },

    runWorkflow: async function(workflowId) {
      await executeWorkflow(workflowId);
    },

    deleteSelectedNode: function() {
      if (selectedNode) {
        deleteNode(selectedNode.id);
      }
    },

    zoomIn: function() {
      canvasZoom = Math.min(canvasZoom * 1.2, 2);
      applyCanvasTransform();
      updateZoomDisplay();
    },

    zoomOut: function() {
      canvasZoom = Math.max(canvasZoom * 0.8, 0.25);
      applyCanvasTransform();
      updateZoomDisplay();
    },

    resetZoom: function() {
      canvasZoom = 1;
      canvasPan = { x: 0, y: 0 };
      applyCanvasTransform();
      updateZoomDisplay();
    },

    toggleSchedule: async function(workflowId, scheduleId, enabled) {
      try {
        const response = await authFetch(`${API_BASE_URL}/api/workflow-schedules/${scheduleId}`, {
          method: 'PUT',
          body: JSON.stringify({ is_enabled: enabled })
        });

        if (!response.ok) throw new Error('Failed to update schedule');

        // Update local state
        const workflow = workflows.find(w => w.id === workflowId);
        if (workflow && workflow.schedule) {
          workflow.schedule.is_enabled = enabled;
        }

        // Show confirmation
        showToast(enabled ? 'Schedule activated' : 'Schedule paused', 'success');

        // Re-render list to update UI
        renderWorkflowsList();
      } catch (error) {
        console.error('Error toggling schedule:', error);
        showToast('Failed to update schedule', 'error');
        // Re-render to reset toggle state
        renderWorkflowsList();
      }
    },

    toggleCardMenu: function(button) {
      // Close any other open menus first
      document.querySelectorAll('.workflow-card-menu-dropdown.show').forEach(dropdown => {
        if (dropdown !== button.nextElementSibling) {
          dropdown.classList.remove('show');
        }
      });

      // Toggle this menu
      const dropdown = button.nextElementSibling;
      dropdown.classList.toggle('show');

      // Stop propagation to prevent immediate close
      event.stopPropagation();
    },

    confirmDeleteWorkflow: function(workflowId, workflowName) {
      // Close any open menu
      document.querySelectorAll('.workflow-card-menu-dropdown.show').forEach(d => d.classList.remove('show'));

      // Create confirmation modal
      const modal = document.createElement('div');
      modal.className = 'workflow-delete-modal-overlay';
      modal.innerHTML = `
        <div class="workflow-delete-modal">
          <h3>Delete Workflow?</h3>
          <p>Are you sure you want to delete <strong>"${workflowName}"</strong>?</p>
          <p class="workflow-delete-warning">This will also delete any scheduled triggers and execution history. This action cannot be undone.</p>
          <div class="workflow-delete-modal-actions">
            <button class="workflow-delete-modal-btn cancel" onclick="this.closest('.workflow-delete-modal-overlay').remove()">Cancel</button>
            <button class="workflow-delete-modal-btn delete" onclick="window.workflowsModule.deleteWorkflow('${workflowId}')">Delete</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      // Close on overlay click
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
      });

      // Close on Escape key
      const handleEscape = (e) => {
        if (e.key === 'Escape') {
          modal.remove();
          document.removeEventListener('keydown', handleEscape);
        }
      };
      document.addEventListener('keydown', handleEscape);
    },

    deleteWorkflow: async function(workflowId) {
      // Remove modal first
      const modal = document.querySelector('.workflow-delete-modal-overlay');
      if (modal) modal.remove();

      try {
        const response = await authFetch(`${API_BASE_URL}/api/workflows/${workflowId}`, {
          method: 'DELETE'
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to delete workflow');
        }

        // Remove from local state
        workflows = workflows.filter(w => w.id !== workflowId);

        // Re-render list
        renderWorkflowsList();

        showToast('Workflow deleted', 'success');
      } catch (error) {
        console.error('Error deleting workflow:', error);
        showToast('Failed to delete workflow: ' + error.message, 'error');
      }
    }
  };

  function updateZoomDisplay() {
    const zoomLevel = document.getElementById('workflowsZoomLevel');
    if (zoomLevel) {
      zoomLevel.textContent = `${Math.round(canvasZoom * 100)}%`;
    }
  }

  // Global functions called from HTML
  window.createNewWorkflow = async function() {
    const workflow = await createWorkflow();
    if (workflow) {
      openWorkflowEditor(workflow);
    }
  };

  window.closeWorkflowEditor = function() {
    closeEditor();
  };

  window.saveWorkflow = function() {
    saveWorkflowToServer();
  };

  window.testWorkflow = async function() {
    if (currentWorkflowId) {
      // Save first
      await saveWorkflowToServer();
      // Then execute
      await executeWorkflow(currentWorkflowId);
    }
  };

  window.closeNodeConfig = function() {
    deselectNode();
  };

})();

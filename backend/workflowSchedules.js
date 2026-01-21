/**
 * Workflow Schedules API
 * Manages scheduled triggers for automated workflow execution
 */

const express = require('express');
const router = express.Router();
const { CronExpressionParser } = require('cron-parser');
const { supabase } = require('./services/supabase');
const { requireAuth } = require('./middleware/auth');
const { logger } = require('./services/logger');

// Common cron presets for the UI
const CRON_PRESETS = {
  'every-hour': { cron: '0 * * * *', label: 'Every hour' },
  'every-6-hours': { cron: '0 */6 * * *', label: 'Every 6 hours' },
  'daily-9am': { cron: '0 9 * * *', label: 'Daily at 9:00 AM' },
  'daily-noon': { cron: '0 12 * * *', label: 'Daily at 12:00 PM' },
  'daily-6pm': { cron: '0 18 * * *', label: 'Daily at 6:00 PM' },
  'weekly-monday': { cron: '0 9 * * 1', label: 'Weekly on Monday at 9:00 AM' },
  'weekly-friday': { cron: '0 9 * * 5', label: 'Weekly on Friday at 9:00 AM' },
  'monthly-first': { cron: '0 9 1 * *', label: 'Monthly on the 1st at 9:00 AM' }
};

/**
 * Calculate the next run time from a cron expression
 */
function calculateNextRun(cronExpression, timezone = 'UTC') {
  try {
    const options = {
      currentDate: new Date(),
      tz: timezone
    };
    const expression = CronExpressionParser.parse(cronExpression, options);
    return expression.next().toDate();
  } catch (error) {
    logger.error('Failed to parse cron expression', { cronExpression, error: error.message });
    return null;
  }
}

/**
 * Validate a cron expression
 */
function validateCronExpression(cronExpression) {
  try {
    CronExpressionParser.parse(cronExpression);
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

// =============================================
// GET /api/workflow-schedules/presets
// Get available cron presets
// =============================================
router.get('/presets', (req, res) => {
  res.json({ presets: CRON_PRESETS });
});

// =============================================
// POST /api/workflow-schedules/validate
// Validate a cron expression
// =============================================
router.post('/validate', (req, res) => {
  const { cron_expression, timezone = 'UTC' } = req.body;

  if (!cron_expression) {
    return res.status(400).json({ error: 'Cron expression is required' });
  }

  const validation = validateCronExpression(cron_expression);

  if (!validation.valid) {
    return res.status(400).json({ valid: false, error: validation.error });
  }

  // Calculate next few run times for preview
  try {
    const options = { currentDate: new Date(), tz: timezone };
    const interval = cronParser.parseExpression(cron_expression, options);
    const nextRuns = [];
    for (let i = 0; i < 5; i++) {
      nextRuns.push(interval.next().toDate().toISOString());
    }
    res.json({ valid: true, next_runs: nextRuns });
  } catch (error) {
    res.status(400).json({ valid: false, error: error.message });
  }
});

// =============================================
// GET /api/workflow-schedules
// List all schedules for the current user
// =============================================
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;

    const { data, error } = await supabase
      .from('workflow_schedules')
      .select(`
        *,
        workflows (
          id,
          name
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ schedules: data || [] });

  } catch (error) {
    logger.error('Error fetching schedules', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
});

// =============================================
// GET /api/workflow-schedules/workflow/:workflowId
// Get schedule for a specific workflow
// =============================================
router.get('/workflow/:workflowId', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const { workflowId } = req.params;

    const { data, error } = await supabase
      .from('workflow_schedules')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    res.json({ schedule: data || null });

  } catch (error) {
    logger.error('Error fetching workflow schedule', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

// =============================================
// POST /api/workflow-schedules
// Create a new schedule
// =============================================
router.post('/', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    logger.info('Schedule POST request', { userId, body: req.body });

    const { workflow_id, cron_expression, timezone = 'UTC', is_enabled = true } = req.body;

    if (!workflow_id || !cron_expression) {
      logger.warn('Schedule POST missing fields', { workflow_id: !!workflow_id, cron_expression: !!cron_expression });
      return res.status(400).json({ error: 'workflow_id and cron_expression are required' });
    }

    // Validate cron expression
    const validation = validateCronExpression(cron_expression);
    if (!validation.valid) {
      return res.status(400).json({ error: `Invalid cron expression: ${validation.error}` });
    }

    // Verify workflow belongs to user
    logger.info('Verifying workflow ownership', { workflow_id, userId });
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('id')
      .eq('id', workflow_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (workflowError) {
      logger.error('Workflow lookup error', { error: workflowError.message });
    }

    if (!workflow) {
      logger.warn('Workflow not found or not owned by user', { workflow_id, userId });
      return res.status(404).json({ error: 'Workflow not found' });
    }
    logger.info('Workflow verified', { workflow_id });

    // Check if schedule already exists for this workflow
    logger.info('Checking for existing schedule', { workflow_id });
    const { data: existing, error: existingError } = await supabase
      .from('workflow_schedules')
      .select('id')
      .eq('workflow_id', workflow_id)
      .maybeSingle();

    if (existingError) {
      logger.error('Existing schedule check error', { error: existingError.message });
    }

    if (existing) {
      logger.warn('Schedule already exists', { workflow_id, existingId: existing.id });
      return res.status(400).json({ error: 'Schedule already exists for this workflow. Use PUT to update.' });
    }

    // Calculate next run time
    const next_run_at = is_enabled ? calculateNextRun(cron_expression, timezone) : null;
    logger.info('Inserting schedule', { workflow_id, cron_expression, timezone, is_enabled, next_run_at });

    const { data, error } = await supabase
      .from('workflow_schedules')
      .insert({
        workflow_id,
        user_id: userId,
        cron_expression,
        timezone,
        is_enabled,
        next_run_at
      })
      .select()
      .single();

    if (error) {
      logger.error('Schedule insert error', { error: error.message, code: error.code, details: error.details });
      throw error;
    }

    logger.info('Schedule created successfully', { scheduleId: data.id, workflowId: workflow_id, userId });

    res.status(201).json({ schedule: data });

  } catch (error) {
    logger.error('Error creating schedule', { error: error.message });
    res.status(500).json({ error: 'Failed to create schedule' });
  }
});

// =============================================
// PUT /api/workflow-schedules/:id
// Update a schedule
// =============================================
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const { cron_expression, timezone, is_enabled } = req.body;

    const updates = {};

    if (cron_expression !== undefined) {
      const validation = validateCronExpression(cron_expression);
      if (!validation.valid) {
        return res.status(400).json({ error: `Invalid cron expression: ${validation.error}` });
      }
      updates.cron_expression = cron_expression;
    }

    if (timezone !== undefined) updates.timezone = timezone;
    if (is_enabled !== undefined) updates.is_enabled = is_enabled;

    // Recalculate next_run_at if schedule is enabled
    if (updates.cron_expression || updates.timezone || updates.is_enabled !== undefined) {
      const { data: current } = await supabase
        .from('workflow_schedules')
        .select('cron_expression, timezone, is_enabled')
        .eq('id', id)
        .eq('user_id', userId)
        .single();

      if (!current) {
        return res.status(404).json({ error: 'Schedule not found' });
      }

      const finalCron = updates.cron_expression || current.cron_expression;
      const finalTimezone = updates.timezone || current.timezone;
      const finalEnabled = updates.is_enabled !== undefined ? updates.is_enabled : current.is_enabled;

      updates.next_run_at = finalEnabled ? calculateNextRun(finalCron, finalTimezone) : null;
    }

    const { data, error } = await supabase
      .from('workflow_schedules')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Schedule not found' });
      }
      throw error;
    }

    logger.info('Schedule updated', { scheduleId: id, userId });

    res.json({ schedule: data });

  } catch (error) {
    logger.error('Error updating schedule', { error: error.message });
    res.status(500).json({ error: 'Failed to update schedule' });
  }
});

// =============================================
// DELETE /api/workflow-schedules/:id
// Delete a schedule
// =============================================
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;

    const { data, error } = await supabase
      .from('workflow_schedules')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Schedule not found' });
      }
      throw error;
    }

    logger.info('Schedule deleted', { scheduleId: id, userId });

    res.json({ success: true, deleted: data });

  } catch (error) {
    logger.error('Error deleting schedule', { error: error.message });
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
});

// =============================================
// POST /api/workflow-schedules/process
// Process due schedules (called by cron job)
// =============================================
router.post('/process', async (req, res) => {
  // Verify cron secret
  const cronSecret = req.headers['x-cron-secret'];
  if (cronSecret !== process.env.CRON_SECRET) {
    logger.warn('Unauthorized cron request');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const now = new Date();

    // Find all enabled schedules that are due
    const { data: dueSchedules, error: fetchError } = await supabase
      .from('workflow_schedules')
      .select(`
        *,
        workflows (
          id,
          name,
          graph,
          user_id
        )
      `)
      .eq('is_enabled', true)
      .lte('next_run_at', now.toISOString())
      .not('next_run_at', 'is', null);

    if (fetchError) throw fetchError;

    logger.info('Processing scheduled workflows', { count: dueSchedules?.length || 0 });

    const results = [];

    for (const schedule of (dueSchedules || [])) {
      try {
        const workflow = schedule.workflows;

        if (!workflow || !workflow.graph?.nodes?.length) {
          logger.warn('Skipping schedule with invalid workflow', { scheduleId: schedule.id });
          continue;
        }

        // Check user has enough credits
        const { data: profile } = await supabase
          .from('profiles')
          .select('credits')
          .eq('id', workflow.user_id)
          .single();

        if ((profile?.credits || 0) < 5) {
          logger.warn('Skipping scheduled workflow - insufficient credits', {
            scheduleId: schedule.id,
            userId: workflow.user_id
          });

          // Update schedule with error
          await supabase
            .from('workflow_schedules')
            .update({
              last_error: 'Insufficient credits',
              next_run_at: calculateNextRun(schedule.cron_expression, schedule.timezone)
            })
            .eq('id', schedule.id);

          continue;
        }

        // Create execution record
        const { data: execution, error: execError } = await supabase
          .from('workflow_executions')
          .insert({
            workflow_id: workflow.id,
            user_id: workflow.user_id,
            status: 'pending',
            context: { triggered_by: 'schedule', schedule_id: schedule.id }
          })
          .select()
          .single();

        if (execError) throw execError;

        // Import and execute workflow (async, don't wait)
        const { executeWorkflowById } = require('./workflowExecutor');
        executeWorkflowById(execution.id, workflow, workflow.user_id).catch(err => {
          logger.error('Scheduled workflow execution failed', {
            executionId: execution.id,
            error: err.message
          });
        });

        // Update schedule
        const nextRun = calculateNextRun(schedule.cron_expression, schedule.timezone);
        await supabase
          .from('workflow_schedules')
          .update({
            last_run_at: now.toISOString(),
            next_run_at: nextRun,
            run_count: (schedule.run_count || 0) + 1,
            last_error: null
          })
          .eq('id', schedule.id);

        results.push({
          schedule_id: schedule.id,
          workflow_id: workflow.id,
          execution_id: execution.id,
          status: 'triggered'
        });

        logger.info('Scheduled workflow triggered', {
          scheduleId: schedule.id,
          workflowId: workflow.id,
          executionId: execution.id
        });

      } catch (scheduleError) {
        logger.error('Error processing schedule', {
          scheduleId: schedule.id,
          error: scheduleError.message
        });

        // Update schedule with error
        await supabase
          .from('workflow_schedules')
          .update({
            last_error: scheduleError.message,
            next_run_at: calculateNextRun(schedule.cron_expression, schedule.timezone)
          })
          .eq('id', schedule.id);

        results.push({
          schedule_id: schedule.id,
          status: 'error',
          error: scheduleError.message
        });
      }
    }

    res.json({
      success: true,
      processed: results.length,
      results
    });

  } catch (error) {
    logger.error('Error processing schedules', { error: error.message });
    res.status(500).json({ error: 'Failed to process schedules' });
  }
});

module.exports = router;

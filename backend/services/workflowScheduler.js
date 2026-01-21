/**
 * Workflow Scheduler Service
 * Runs in-process with node-cron to process scheduled workflows
 */

const cron = require('node-cron');
const { CronExpressionParser } = require('cron-parser');
const { supabase } = require('./supabase');
const { logger } = require('./logger');

let schedulerTask = null;

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
 * Process all due scheduled workflows
 */
async function processSchedules() {
  if (!supabase) {
    logger.warn('Scheduler: Supabase not configured, skipping');
    return { processed: 0, results: [] };
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

    if (fetchError) {
      logger.error('Scheduler: Failed to fetch due schedules', { error: fetchError.message });
      return { processed: 0, results: [], error: fetchError.message };
    }

    if (!dueSchedules || dueSchedules.length === 0) {
      return { processed: 0, results: [] };
    }

    logger.info('Scheduler: Processing due workflows', { count: dueSchedules.length });

    const results = [];

    for (const schedule of dueSchedules) {
      try {
        const workflow = schedule.workflows;

        if (!workflow || !workflow.graph?.nodes?.length) {
          logger.warn('Scheduler: Skipping schedule with invalid workflow', { scheduleId: schedule.id });
          continue;
        }

        // Check user has enough credits
        const { data: profile } = await supabase
          .from('profiles')
          .select('credits')
          .eq('id', workflow.user_id)
          .single();

        if ((profile?.credits || 0) < 5) {
          logger.warn('Scheduler: Insufficient credits', {
            scheduleId: schedule.id,
            userId: workflow.user_id,
            credits: profile?.credits || 0
          });

          // Update schedule with error
          await supabase
            .from('workflow_schedules')
            .update({
              last_error: 'Insufficient credits',
              next_run_at: calculateNextRun(schedule.cron_expression, schedule.timezone)
            })
            .eq('id', schedule.id);

          results.push({
            schedule_id: schedule.id,
            status: 'skipped',
            reason: 'insufficient_credits'
          });
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
        const { executeWorkflowById } = require('../workflowExecutor');
        executeWorkflowById(execution.id, workflow, workflow.user_id).catch(err => {
          logger.error('Scheduler: Workflow execution failed', {
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

        logger.info('Scheduler: Workflow triggered', {
          scheduleId: schedule.id,
          workflowId: workflow.id,
          executionId: execution.id,
          nextRun: nextRun?.toISOString()
        });

      } catch (scheduleError) {
        logger.error('Scheduler: Error processing schedule', {
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

    return { processed: results.length, results };

  } catch (error) {
    logger.error('Scheduler: Fatal error', { error: error.message });
    return { processed: 0, results: [], error: error.message };
  }
}

/**
 * Start the workflow scheduler
 * Runs every minute to check for due schedules
 */
function startScheduler() {
  if (schedulerTask) {
    logger.warn('Scheduler: Already running');
    return;
  }

  // Run every minute
  schedulerTask = cron.schedule('* * * * *', async () => {
    try {
      const result = await processSchedules();
      if (result.processed > 0) {
        logger.info('Scheduler: Cycle complete', { processed: result.processed });
      }
    } catch (error) {
      logger.error('Scheduler: Cycle failed', { error: error.message });
    }
  });

  logger.info('Workflow scheduler started (runs every minute)');
}

/**
 * Stop the workflow scheduler
 */
function stopScheduler() {
  if (schedulerTask) {
    schedulerTask.stop();
    schedulerTask = null;
    logger.info('Workflow scheduler stopped');
  }
}

module.exports = {
  startScheduler,
  stopScheduler,
  processSchedules
};

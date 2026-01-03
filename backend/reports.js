const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Lazy initialization of Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
if (supabaseUrl && supabaseServiceKey) {
  supabase = createClient(supabaseUrl, supabaseServiceKey);
}

// Rate limit settings
const RATE_LIMIT_WINDOW_HOURS = 24;
const MAX_REPORTS_PER_WINDOW = 10;

// Valid report reasons
const VALID_REASONS = [
  'illegal_content',
  'underage_depiction',
  'non_consensual',
  'harassment',
  'spam',
  'impersonation',
  'hate_speech',
  'other'
];

// Valid content types
const VALID_CONTENT_TYPES = ['image', 'video', 'audio', 'chat_message'];

// Check and update rate limit for a user
async function checkRateLimit(userId) {
  if (!supabase || !userId) return { allowed: true };

  try {
    // Get current rate limit record
    const { data: rateLimit, error } = await supabase
      .from('report_rate_limits')
      .select('*')
      .eq('user_id', userId)
      .single();

    const now = new Date();
    const windowStart = rateLimit?.window_start ? new Date(rateLimit.window_start) : now;
    const hoursSinceWindow = (now - windowStart) / (1000 * 60 * 60);

    // Reset window if expired
    if (hoursSinceWindow >= RATE_LIMIT_WINDOW_HOURS) {
      await supabase
        .from('report_rate_limits')
        .upsert({
          user_id: userId,
          report_count: 1,
          window_start: now.toISOString(),
          last_report_at: now.toISOString()
        });
      return { allowed: true, remaining: MAX_REPORTS_PER_WINDOW - 1 };
    }

    // Check if under limit
    const currentCount = rateLimit?.report_count || 0;
    if (currentCount >= MAX_REPORTS_PER_WINDOW) {
      const resetTime = new Date(windowStart.getTime() + RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000);
      return {
        allowed: false,
        remaining: 0,
        resetAt: resetTime.toISOString()
      };
    }

    // Increment count
    await supabase
      .from('report_rate_limits')
      .upsert({
        user_id: userId,
        report_count: currentCount + 1,
        window_start: windowStart.toISOString(),
        last_report_at: now.toISOString()
      });

    return { allowed: true, remaining: MAX_REPORTS_PER_WINDOW - currentCount - 1 };
  } catch (error) {
    console.error('Rate limit check error:', error);
    return { allowed: true }; // Allow on error
  }
}

// POST /api/reports - Submit a new report
router.post('/', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ error: 'Reporting service not configured' });
    }

    const {
      reporter_user_id,
      anonymous,
      content_type,
      content_id,
      content_url,
      content_preview,
      reported_user_id,
      reason,
      details
    } = req.body;

    // Validate required fields
    if (!content_type || !reason) {
      return res.status(400).json({ error: 'content_type and reason are required' });
    }

    if (!VALID_CONTENT_TYPES.includes(content_type)) {
      return res.status(400).json({ error: 'Invalid content_type' });
    }

    if (!VALID_REASONS.includes(reason)) {
      return res.status(400).json({ error: 'Invalid reason' });
    }

    // Check rate limit
    if (reporter_user_id) {
      const rateCheck = await checkRateLimit(reporter_user_id);
      if (!rateCheck.allowed) {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          message: `You can submit up to ${MAX_REPORTS_PER_WINDOW} reports per ${RATE_LIMIT_WINDOW_HOURS} hours`,
          resetAt: rateCheck.resetAt
        });
      }
    }

    // Check for duplicate report (same user, same content)
    if (reporter_user_id && content_id) {
      const { data: existing } = await supabase
        .from('reports')
        .select('id')
        .eq('reporter_user_id', reporter_user_id)
        .eq('content_type', content_type)
        .eq('content_id', content_id)
        .single();

      if (existing) {
        return res.status(409).json({
          error: 'Duplicate report',
          message: 'You have already reported this content'
        });
      }
    }

    // Create the report
    const { data: report, error } = await supabase
      .from('reports')
      .insert({
        reporter_user_id: reporter_user_id || null,
        anonymous: anonymous || false,
        content_type,
        content_id: content_id || null,
        content_url: content_url || null,
        content_preview: content_preview ? content_preview.substring(0, 500) : null,
        reported_user_id: reported_user_id || null,
        reason,
        details: details ? details.substring(0, 2000) : null,
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating report:', error);
      return res.status(500).json({ error: 'Failed to submit report' });
    }

    res.status(201).json({
      success: true,
      message: 'Report submitted successfully. Our team will review it.',
      report_id: report.id
    });

  } catch (error) {
    console.error('Report submission error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/reports - Get reports (admin: all, user: own)
router.get('/', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ error: 'Reporting service not configured' });
    }

    const { user_id, is_admin, status, content_type, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from('reports')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Filter by user if not admin
    if (!is_admin || is_admin === 'false') {
      if (!user_id) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      query = query.eq('reporter_user_id', user_id);
    }

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }
    if (content_type) {
      query = query.eq('content_type', content_type);
    }

    const { data: reports, error, count } = await query;

    if (error) {
      console.error('Error fetching reports:', error);
      return res.status(500).json({ error: 'Failed to fetch reports' });
    }

    // If admin, mask reporter info for anonymous reports
    if (is_admin === 'true') {
      reports.forEach(report => {
        if (report.anonymous) {
          report.reporter_user_id = null;
        }
      });
    }

    res.json({
      reports,
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/reports/stats - Get report statistics (admin only)
router.get('/stats', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ error: 'Reporting service not configured' });
    }

    // Get counts by status
    const { data: statusCounts, error: statusError } = await supabase
      .from('reports')
      .select('status')
      .then(result => {
        const counts = { pending: 0, reviewing: 0, resolved: 0, dismissed: 0 };
        result.data?.forEach(r => { counts[r.status]++; });
        return { data: counts, error: result.error };
      });

    // Get counts by reason (pending only)
    const { data: reasonCounts, error: reasonError } = await supabase
      .from('reports')
      .select('reason')
      .eq('status', 'pending')
      .then(result => {
        const counts = {};
        result.data?.forEach(r => {
          counts[r.reason] = (counts[r.reason] || 0) + 1;
        });
        return { data: counts, error: result.error };
      });

    // Get counts by content type (pending only)
    const { data: typeCounts, error: typeError } = await supabase
      .from('reports')
      .select('content_type')
      .eq('status', 'pending')
      .then(result => {
        const counts = {};
        result.data?.forEach(r => {
          counts[r.content_type] = (counts[r.content_type] || 0) + 1;
        });
        return { data: counts, error: result.error };
      });

    // Get auto-hidden count
    const { count: autoHiddenCount } = await supabase
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('auto_hidden', true)
      .eq('status', 'pending');

    res.json({
      by_status: statusCounts,
      by_reason: reasonCounts,
      by_content_type: typeCounts,
      auto_hidden_pending: autoHiddenCount || 0
    });

  } catch (error) {
    console.error('Error fetching report stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/reports/:id - Update a report (admin only)
router.put('/:id', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ error: 'Reporting service not configured' });
    }

    const { id } = req.params;
    const {
      admin_user_id,
      status,
      action_taken,
      admin_notes,
      notify_reporter
    } = req.body;

    if (!admin_user_id) {
      return res.status(401).json({ error: 'Admin authentication required' });
    }

    // First, get the report to check content details
    const { data: existingReport, error: fetchError } = await supabase
      .from('reports')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existingReport) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // If action is content_removed, actually remove the content
    if (action_taken === 'content_removed') {
      try {
        await removeReportedContent(existingReport);
        console.log(`Content removed for report ${id}: ${existingReport.content_type}`);
      } catch (removeError) {
        console.error('Error removing content:', removeError);
        // Continue with report update even if removal fails
      }
    }

    // Build update object
    const updates = {
      reviewed_by: admin_user_id,
      reviewed_at: new Date().toISOString()
    };

    if (status) {
      updates.status = status;
    }
    if (action_taken) {
      updates.action_taken = action_taken;
    }
    if (admin_notes !== undefined) {
      updates.admin_notes = admin_notes;
    }
    if (notify_reporter) {
      updates.reporter_notified = true;
      updates.reporter_notified_at = new Date().toISOString();
    }

    const { data: report, error } = await supabase
      .from('reports')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating report:', error);
      return res.status(500).json({ error: 'Failed to update report' });
    }

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json({
      success: true,
      report,
      content_removed: action_taken === 'content_removed'
    });

  } catch (error) {
    console.error('Error updating report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to remove reported content
async function removeReportedContent(report) {
  const { content_type, content_id, content_url } = report;

  switch (content_type) {
    case 'image':
      // Try to delete from generated_images table by URL
      if (content_url) {
        const { error } = await supabase
          .from('generated_images')
          .delete()
          .eq('public_url', content_url);
        if (error) console.error('Error deleting image record:', error);
      }
      // Also try by content_id if it's a database ID
      if (content_id && content_id.match(/^[0-9a-f-]{36}$/i)) {
        const { error } = await supabase
          .from('generated_images')
          .delete()
          .eq('id', content_id);
        if (error) console.error('Error deleting image by ID:', error);
      }
      break;

    case 'video':
      // Try to delete from generated_videos table by URL
      if (content_url) {
        const { error } = await supabase
          .from('generated_videos')
          .delete()
          .eq('public_url', content_url);
        if (error) console.error('Error deleting video record:', error);
      }
      // Also try by content_id if it's a database ID
      if (content_id && content_id.match(/^[0-9a-f-]{36}$/i)) {
        const { error } = await supabase
          .from('generated_videos')
          .delete()
          .eq('id', content_id);
        if (error) console.error('Error deleting video by ID:', error);
      }
      break;

    case 'chat_message':
      // Delete chat message from messages table
      if (content_id) {
        const { error } = await supabase
          .from('chat_messages')
          .delete()
          .eq('id', content_id);
        if (error) console.error('Error deleting chat message:', error);
      }
      break;

    case 'audio':
      // Audio deletion - add if you have an audio table
      console.log('Audio content removal not yet implemented');
      break;

    default:
      console.log(`Unknown content type: ${content_type}`);
  }
}

// GET /api/reports/:id - Get a single report
router.get('/:id', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ error: 'Reporting service not configured' });
    }

    const { id } = req.params;
    const { user_id, is_admin } = req.query;

    let query = supabase
      .from('reports')
      .select('*')
      .eq('id', id)
      .single();

    const { data: report, error } = await query;

    if (error || !report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Check access
    if (is_admin !== 'true' && report.reporter_user_id !== user_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Mask reporter if anonymous (even for admins)
    if (report.anonymous) {
      report.reporter_user_id = null;
    }

    res.json({ report });

  } catch (error) {
    console.error('Error fetching report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/reports/check/:contentType/:contentId - Check if content is auto-hidden
router.get('/check/:contentType/:contentId', async (req, res) => {
  try {
    if (!supabase) {
      return res.json({ hidden: false });
    }

    const { contentType, contentId } = req.params;

    const { data: reports } = await supabase
      .from('reports')
      .select('auto_hidden')
      .eq('content_type', contentType)
      .eq('content_id', contentId)
      .eq('auto_hidden', true)
      .limit(1);

    res.json({
      hidden: reports && reports.length > 0
    });

  } catch (error) {
    console.error('Error checking content status:', error);
    res.json({ hidden: false });
  }
});

module.exports = router;

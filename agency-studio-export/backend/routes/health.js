/**
 * Health Check Routes
 * For monitoring and load balancer health checks
 */

const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../services/supabase');

/**
 * GET /health
 * Basic health check
 */
router.get('/', async (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'agency-studio-api',
  });
});

/**
 * GET /health/detailed
 * Detailed health check including dependencies
 */
router.get('/detailed', async (req, res) => {
  const checks = {
    api: 'ok',
    database: 'unknown',
  };

  try {
    // Check Supabase connection
    const { error } = await supabaseAdmin
      .from('agencies')
      .select('count')
      .limit(1);

    checks.database = error ? 'error' : 'ok';
  } catch (e) {
    checks.database = 'error';
  }

  const allOk = Object.values(checks).every((v) => v === 'ok');

  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
  });
});

module.exports = router;

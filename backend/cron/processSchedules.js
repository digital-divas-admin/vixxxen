#!/usr/bin/env node

/**
 * Cron Job: Process Scheduled Workflows
 *
 * This script is called by Render's cron service every minute.
 * It triggers the workflow schedules processing endpoint.
 */

const https = require('https');
const http = require('http');

const API_URL = process.env.API_URL || 'http://localhost:3001';
const CRON_SECRET = process.env.CRON_SECRET;

if (!CRON_SECRET) {
  console.error('ERROR: CRON_SECRET environment variable is required');
  process.exit(1);
}

async function processSchedules() {
  const url = new URL('/api/workflow-schedules/process', API_URL);
  const isHttps = url.protocol === 'https:';
  const client = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.request({
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Cron-Secret': CRON_SECRET
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const result = JSON.parse(data);
            console.log(`[${new Date().toISOString()}] Processed ${result.processed || 0} schedules`);
            if (result.results && result.results.length > 0) {
              result.results.forEach(r => {
                console.log(`  - Schedule ${r.schedule_id}: ${r.status}`);
              });
            }
            resolve(result);
          } catch (e) {
            console.log(`[${new Date().toISOString()}] Response: ${data}`);
            resolve(data);
          }
        } else {
          console.error(`[${new Date().toISOString()}] ERROR: HTTP ${res.statusCode}`);
          console.error(`Response: ${data}`);
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    req.on('error', (error) => {
      console.error(`[${new Date().toISOString()}] ERROR: ${error.message}`);
      reject(error);
    });

    req.end();
  });
}

// Run the cron job
processSchedules()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Cron job failed:', error.message);
    process.exit(1);
  });

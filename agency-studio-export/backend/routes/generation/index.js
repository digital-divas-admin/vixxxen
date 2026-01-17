/**
 * Generation Routes Index
 * Combines all generation model routes
 */

const express = require('express');
const router = express.Router();

const seedreamRoutes = require('./seedream');
const nanoBananaRoutes = require('./nanoBanana');
const klingRoutes = require('./kling');

// Mount routes
router.use('/seedream', seedreamRoutes);
router.use('/nano-banana', nanoBananaRoutes);
router.use('/kling', klingRoutes);

// GET /api/generate/status - Get all model statuses
router.get('/status', (req, res) => {
  const { config } = require('../../config');

  res.json({
    models: {
      image: [
        {
          id: 'seedream',
          name: 'Seedream 4.5',
          configured: !!config.wavespeed.apiKey,
          creditCost: config.creditCosts.seedream
        },
        {
          id: 'nanoBanana',
          name: 'Nano Banana Pro',
          configured: !!config.openrouter.apiKey,
          creditCost: config.creditCosts.nanoBanana
        }
      ],
      video: [
        {
          id: 'kling',
          name: 'Kling 2.5 Turbo Pro',
          configured: !!config.replicate.apiKey,
          creditCost: config.creditCosts.kling
        }
      ]
    }
  });
});

module.exports = router;

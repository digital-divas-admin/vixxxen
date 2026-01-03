const express = require('express');
const router = express.Router();
const Replicate = require('replicate');

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_KEY,
});

const BG_REMOVER_MODEL = "851-labs/background-remover:a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc";

router.post('/remove', async (req, res) => {
  try {
    const { image } = req.body;

    console.log('Received background removal request');

    if (!image) {
      return res.status(400).json({
        success: false,
        error: 'Image is required'
      });
    }

    console.log('Running 851 Labs background remover...');

    const output = await replicate.run(BG_REMOVER_MODEL, {
      input: {
        image: image
      }
    });

    console.log('Background removal completed');

    // The output is a file object with a url() method
    const resultUrl = output.url ? output.url() : output;

    res.json({
      success: true,
      image: resultUrl
    });

  } catch (error) {
    console.error('Background removal error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to remove background'
    });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    service: '851-labs-bg-remover',
    status: 'healthy',
    model: BG_REMOVER_MODEL
  });
});

module.exports = router;

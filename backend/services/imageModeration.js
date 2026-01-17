/**
 * Image Moderation Service
 * Uses AWS Rekognition to screen images for:
 * - Celebrity detection (to prevent deepfakes/impersonation)
 * - Content moderation (to detect minors/inappropriate content)
 */

const { RekognitionClient, DetectModerationLabelsCommand, RecognizeCelebritiesCommand, DetectFacesCommand } = require('@aws-sdk/client-rekognition');
const sharp = require('sharp');
const { logger } = require('./logger');

// Age threshold - flag any face estimated to be under this age
const MINOR_AGE_THRESHOLD = 18;

// Initialize Rekognition client
let rekognitionClient = null;

function getClient() {
  if (!rekognitionClient) {
    const region = process.env.AWS_REGION || 'us-east-1';

    // Check for required credentials
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      logger.warn('AWS credentials not configured - image moderation disabled');
      return null;
    }

    rekognitionClient = new RekognitionClient({
      region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });

    logger.info('Rekognition client initialized', { region });
  }
  return rekognitionClient;
}

/**
 * Moderation result structure
 * @typedef {Object} ModerationResult
 * @property {boolean} approved - Whether the image passed moderation
 * @property {boolean} hasCelebrity - Whether a celebrity was detected
 * @property {boolean} hasMinor - Whether content suggesting minors was detected
 * @property {string[]} reasons - List of rejection reasons
 * @property {Object[]} celebrities - Detected celebrities with names and confidence
 * @property {Object[]} moderationLabels - Detected moderation labels
 */

/**
 * Screen an image using AWS Rekognition
 * @param {Buffer|string} image - Image as Buffer or base64 string
 * @param {Object} options - Screening options
 * @param {boolean} options.checkCelebrities - Whether to check for celebrities (default: true)
 * @param {boolean} options.checkModeration - Whether to check for inappropriate content (default: true)
 * @param {number} options.celebrityConfidenceThreshold - Min confidence for celebrity detection (default: 90)
 * @param {number} options.moderationConfidenceThreshold - Min confidence for moderation labels (default: 75)
 * @returns {Promise<ModerationResult>}
 */
async function screenImage(image, options = {}) {
  const {
    checkCelebrities = true,
    checkModeration = true,
    celebrityConfidenceThreshold = 90,
    moderationConfidenceThreshold = 75
  } = options;

  const client = getClient();

  // If client not available, allow image through but log warning
  if (!client) {
    logger.warn('Image moderation skipped - AWS not configured');
    return {
      approved: true,
      hasCelebrity: false,
      hasMinor: false,
      reasons: [],
      celebrities: [],
      moderationLabels: [],
      skipped: true
    };
  }

  // Convert to Buffer if base64 string
  let imageBuffer;
  if (typeof image === 'string') {
    // Remove data URL prefix if present
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    imageBuffer = Buffer.from(base64Data, 'base64');
  } else {
    imageBuffer = image;
  }

  // Convert to JPEG for AWS Rekognition compatibility
  // Rekognition only supports JPEG and PNG, not WebP or other formats
  try {
    imageBuffer = await sharp(imageBuffer)
      .jpeg({ quality: 90 })
      .toBuffer();
  } catch (conversionError) {
    logger.error('Image conversion failed', { error: conversionError.message });
    return {
      approved: false,
      hasCelebrity: false,
      hasMinor: false,
      reasons: ['Image format not supported - please use JPEG or PNG'],
      celebrities: [],
      moderationLabels: []
    };
  }

  const result = {
    approved: true,
    hasCelebrity: false,
    hasMinor: false,
    reasons: [],
    celebrities: [],
    moderationLabels: [],
    faceDetails: null
  };

  try {
    // Run checks in parallel for speed
    const checks = [];

    if (checkCelebrities) {
      checks.push(detectCelebrities(client, imageBuffer, celebrityConfidenceThreshold));
    }

    if (checkModeration) {
      checks.push(detectModerationLabels(client, imageBuffer, moderationConfidenceThreshold));
    }

    // ALWAYS check for faces/age to detect minors
    checks.push(detectFaces(client, imageBuffer));

    const results = await Promise.all(checks);

    // Calculate result indices based on which checks were enabled
    let currentIndex = 0;

    // Process celebrity results
    if (checkCelebrities) {
      const celebrityResult = results[currentIndex];
      currentIndex++;
      if (celebrityResult && celebrityResult.celebrities.length > 0) {
        result.hasCelebrity = true;
        result.celebrities = celebrityResult.celebrities;
        result.approved = false;
        result.reasons.push(`Celebrity detected: ${celebrityResult.celebrities.map(c => c.name).join(', ')}`);
      }
    }

    // Process moderation results
    if (checkModeration) {
      const moderationResult = results[currentIndex];
      currentIndex++;
      if (moderationResult) {
        result.moderationLabels = moderationResult.labels;

        // Check for content suggesting minors via labels
        const minorLabels = moderationResult.labels.filter(label =>
          isMinorRelatedLabel(label.name, label.parentName)
        );

        if (minorLabels.length > 0) {
          result.hasMinor = true;
          result.approved = false;
          result.reasons.push(`Content involving minors detected: ${minorLabels.map(l => l.name).join(', ')}`);
        }
      }
    }

    // Process face detection results - CRITICAL for detecting minors
    const faceResult = results[currentIndex];
    if (faceResult) {
      result.faceDetails = faceResult;

      if (faceResult.hasMinor) {
        result.hasMinor = true;
        result.approved = false;

        // Build descriptive message about detected minor faces
        const minorAges = faceResult.minorFaces.map(f =>
          `${f.ageRange.Low}-${f.ageRange.High} years`
        ).join(', ');
        result.reasons.push(`Person appearing to be a minor detected (estimated age: ${minorAges}). Images containing minors are not allowed.`);
      }
    }

    logger.info('Image moderation completed', {
      approved: result.approved,
      hasCelebrity: result.hasCelebrity,
      hasMinor: result.hasMinor,
      faceCount: faceResult?.faceCount || 0,
      celebrityCount: result.celebrities.length,
      labelCount: result.moderationLabels.length
    });

  } catch (error) {
    logger.error('Image moderation error', { error: error.message });
    // On error, we can either block or allow - blocking is safer for compliance
    result.approved = false;
    result.reasons.push(`Moderation check failed: ${error.message}`);
  }

  return result;
}

/**
 * Detect celebrities in an image
 */
async function detectCelebrities(client, imageBuffer, confidenceThreshold) {
  const command = new RecognizeCelebritiesCommand({
    Image: {
      Bytes: imageBuffer
    }
  });

  const response = await client.send(command);

  const celebrities = (response.CelebrityFaces || [])
    .filter(celeb => celeb.MatchConfidence >= confidenceThreshold)
    .map(celeb => ({
      name: celeb.Name,
      confidence: celeb.MatchConfidence,
      id: celeb.Id,
      urls: celeb.Urls || []
    }));

  return { celebrities };
}

/**
 * Detect moderation labels in an image
 */
async function detectModerationLabels(client, imageBuffer, confidenceThreshold) {
  const command = new DetectModerationLabelsCommand({
    Image: {
      Bytes: imageBuffer
    },
    MinConfidence: confidenceThreshold
  });

  const response = await client.send(command);

  const labels = (response.ModerationLabels || []).map(label => ({
    name: label.Name,
    parentName: label.ParentName,
    confidence: label.Confidence,
    taxonomyLevel: label.TaxonomyLevel
  }));

  return { labels };
}

/**
 * Detect faces in an image and estimate ages
 * Used to flag images containing minors
 */
async function detectFaces(client, imageBuffer) {
  const command = new DetectFacesCommand({
    Image: {
      Bytes: imageBuffer
    },
    Attributes: ['AGE_RANGE']
  });

  const response = await client.send(command);

  const faces = (response.FaceDetails || []).map(face => ({
    ageRange: face.AgeRange,
    confidence: face.Confidence
  }));

  // Check if any face appears to be a minor - STRICT MODE
  // Flag if the LOW end of the age range is under 18
  // This catches anyone who COULD be a minor based on appearance
  // Examples: 13-17 (flagged), 14-20 (flagged), 16-22 (flagged), 18-24 (OK)
  const minorFaces = faces.filter(face => {
    if (face.ageRange) {
      // Flag if the LOW end suggests they could be under 18
      return face.ageRange.Low < MINOR_AGE_THRESHOLD;
    }
    return false;
  });

  return {
    faces,
    hasMinor: minorFaces.length > 0,
    minorFaces,
    faceCount: faces.length
  };
}

/**
 * Check if a moderation label indicates content involving minors
 */
function isMinorRelatedLabel(name, parentName) {
  const minorIndicators = [
    'child',
    'minor',
    'underage',
    'infant',
    'baby',
    'toddler',
    'teen',
    'adolescent',
    'youth',
    'kid',
    'pediatric'
  ];

  const lowerName = (name || '').toLowerCase();
  const lowerParent = (parentName || '').toLowerCase();

  return minorIndicators.some(indicator =>
    lowerName.includes(indicator) || lowerParent.includes(indicator)
  );
}

/**
 * Screen an image from a URL
 * Downloads the image and screens it
 */
async function screenImageFromUrl(url, options = {}) {
  try {
    const fetch = require('node-fetch');
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    const buffer = await response.buffer();
    return screenImage(buffer, options);

  } catch (error) {
    logger.error('Failed to screen image from URL', { url, error: error.message });
    return {
      approved: false,
      hasCelebrity: false,
      hasMinor: false,
      reasons: [`Failed to fetch image for screening: ${error.message}`],
      celebrities: [],
      moderationLabels: []
    };
  }
}

/**
 * Check if moderation is enabled (AWS configured)
 */
function isEnabled() {
  return !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
}

/**
 * Screen multiple images and return combined result
 * Fails fast - returns rejection as soon as any image fails
 * @param {Array<Buffer|string>} images - Array of images as Buffers or base64 strings
 * @param {Object} options - Screening options (same as screenImage)
 * @returns {Promise<{approved: boolean, failedIndex: number|null, reasons: string[]}>}
 */
async function screenImages(images, options = {}) {
  if (!isEnabled()) {
    logger.warn('Image moderation skipped - AWS not configured');
    return { approved: true, failedIndex: null, reasons: [], skipped: true };
  }

  if (!images || images.length === 0) {
    return { approved: true, failedIndex: null, reasons: [] };
  }

  const allReasons = [];

  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    if (!image) continue;

    try {
      let result;
      if (typeof image === 'string' && image.startsWith('http')) {
        result = await screenImageFromUrl(image, options);
      } else {
        result = await screenImage(image, options);
      }

      if (!result.approved) {
        logger.warn('Image rejected by moderation', { imageIndex: i, reasons: result.reasons });
        return {
          approved: false,
          failedIndex: i,
          reasons: result.reasons,
          hasCelebrity: result.hasCelebrity,
          hasMinor: result.hasMinor
        };
      }
    } catch (error) {
      logger.error('Image screening failed', { imageIndex: i, error: error.message });
      return {
        approved: false,
        failedIndex: i,
        reasons: [`Screening failed for image ${i + 1}: ${error.message}`]
      };
    }
  }

  return { approved: true, failedIndex: null, reasons: [] };
}

module.exports = {
  screenImage,
  screenImageFromUrl,
  screenImages,
  isEnabled
};

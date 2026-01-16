const sharp = require('sharp');

/**
 * Compress a base64 image to reduce file size for API requests
 *
 * @param {string} base64DataUrl - Base64 data URL (e.g., "data:image/png;base64,...")
 * @param {Object} options - Compression options
 * @param {number} options.maxDimension - Max width/height in pixels (default: 1536)
 * @param {number} options.quality - JPEG quality 1-100 (default: 80)
 * @returns {Promise<string>} - Compressed base64 data URL
 */
async function compressImage(base64DataUrl, options = {}) {
  const {
    maxDimension = 1536,
    quality = 80
  } = options;

  try {
    // Extract base64 data from data URL
    const matches = base64DataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) {
      console.warn('Invalid base64 data URL format, returning original');
      return base64DataUrl;
    }

    const imageBuffer = Buffer.from(matches[2], 'base64');
    const originalSize = imageBuffer.length;

    // Get image metadata
    const metadata = await sharp(imageBuffer).metadata();
    const { width, height } = metadata;

    // Calculate new dimensions while maintaining aspect ratio
    let newWidth = width;
    let newHeight = height;

    if (width > maxDimension || height > maxDimension) {
      if (width > height) {
        newWidth = maxDimension;
        newHeight = Math.round((height / width) * maxDimension);
      } else {
        newHeight = maxDimension;
        newWidth = Math.round((width / height) * maxDimension);
      }
    }

    // Compress the image
    const compressedBuffer = await sharp(imageBuffer)
      .resize(newWidth, newHeight, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({
        quality: quality,
        mozjpeg: true
      })
      .toBuffer();

    const compressedSize = compressedBuffer.length;
    const compressionRatio = ((1 - compressedSize / originalSize) * 100).toFixed(1);

    console.log(`   📦 Image compressed: ${(originalSize / 1024 / 1024).toFixed(2)}MB → ${(compressedSize / 1024 / 1024).toFixed(2)}MB (${compressionRatio}% reduction)`);
    console.log(`   📐 Dimensions: ${width}x${height} → ${newWidth}x${newHeight}`);

    // Return as JPEG data URL
    return `data:image/jpeg;base64,${compressedBuffer.toString('base64')}`;

  } catch (error) {
    console.error('Image compression error:', error.message);
    // Return original if compression fails
    return base64DataUrl;
  }
}

/**
 * Compress multiple images in parallel
 *
 * @param {string[]} base64DataUrls - Array of base64 data URLs
 * @param {Object} options - Compression options
 * @returns {Promise<string[]>} - Array of compressed base64 data URLs
 */
async function compressImages(base64DataUrls, options = {}) {
  if (!base64DataUrls || base64DataUrls.length === 0) {
    return [];
  }

  console.log(`   📦 Compressing ${base64DataUrls.length} reference image(s)...`);

  const compressed = await Promise.all(
    base64DataUrls.map(url => compressImage(url, options))
  );

  return compressed;
}

module.exports = {
  compressImage,
  compressImages
};

/**
 * Image Compression Service
 * Compresses images for API requests to reduce bandwidth
 */

const sharp = require('sharp');

/**
 * Compress a base64 image to reduce file size for API requests
 */
async function compressImage(base64DataUrl, options = {}) {
  const {
    maxDimension = 1536,
    quality = 80
  } = options;

  try {
    const matches = base64DataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) {
      console.warn('Invalid base64 data URL format, returning original');
      return base64DataUrl;
    }

    const imageBuffer = Buffer.from(matches[2], 'base64');
    const originalSize = imageBuffer.length;

    const metadata = await sharp(imageBuffer).metadata();
    const { width, height } = metadata;

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

    console.log(`   Image compressed: ${(originalSize / 1024 / 1024).toFixed(2)}MB → ${(compressedSize / 1024 / 1024).toFixed(2)}MB (${compressionRatio}% reduction)`);

    return `data:image/jpeg;base64,${compressedBuffer.toString('base64')}`;

  } catch (error) {
    console.error('Image compression error:', error.message);
    return base64DataUrl;
  }
}

/**
 * Compress multiple images in parallel
 */
async function compressImages(base64DataUrls, options = {}) {
  if (!base64DataUrls || base64DataUrls.length === 0) {
    return [];
  }

  console.log(`   Compressing ${base64DataUrls.length} reference image(s)...`);

  const compressed = await Promise.all(
    base64DataUrls.map(url => compressImage(url, options))
  );

  return compressed;
}

module.exports = {
  compressImage,
  compressImages
};

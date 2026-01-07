// ===========================================
// DELETE FUNCTIONS - Image and Video deletion
// ===========================================
// Depends on: config.js (currentUser, supabaseClient)
// Note: generatedImages and generatedVideos arrays are defined in main inline script

// Delete a single image
async function deleteImage(element) {
  if (!confirm('Delete this image? This cannot be undone.')) return;

  const imageId = element.dataset.imageId;
  const imageUrl = element.dataset.imageUrl;

  // Add deleting state
  element.style.opacity = '0.5';
  element.style.pointerEvents = 'none';

  try {
    // If we have an ID, delete from database and storage
    if (imageId && currentUser) {
      // Get the storage path from the database first
      const { data: imageData, error: fetchError } = await supabaseClient
        .from('generated_images')
        .select('storage_path')
        .eq('id', imageId)
        .single();

      if (!fetchError && imageData?.storage_path) {
        // Delete from storage
        const { error: storageError } = await supabaseClient.storage
          .from('generated-images')
          .remove([imageData.storage_path]);

        if (storageError) {
          console.error('Storage delete error:', storageError);
        }
      }

      // Delete from database
      const { error: dbError } = await supabaseClient
        .from('generated_images')
        .delete()
        .eq('id', imageId);

      if (dbError) {
        console.error('Database delete error:', dbError);
        throw dbError;
      }
    }

    // Remove from local array
    const index = generatedImages.findIndex(img => img.url === imageUrl);
    if (index > -1) {
      generatedImages.splice(index, 1);
    }

    // Remove from DOM with animation
    element.style.transition = 'opacity 0.3s, transform 0.3s';
    element.style.opacity = '0';
    element.style.transform = 'scale(0.8)';
    setTimeout(() => element.remove(), 300);

    console.log('Image deleted successfully');
  } catch (error) {
    console.error('Error deleting image:', error);
    alert('Failed to delete image: ' + error.message);
    element.style.opacity = '1';
    element.style.pointerEvents = 'auto';
  }
}

// Delete a single video
async function deleteVideo(element) {
  if (!confirm('Delete this video? This cannot be undone.')) return;

  const videoId = element.dataset.videoId;
  const videoUrl = element.dataset.videoUrl;

  // Add deleting state
  element.style.opacity = '0.5';
  element.style.pointerEvents = 'none';

  try {
    // If we have an ID, delete from database and storage
    if (videoId && currentUser) {
      // Get the storage path from the database first
      const { data: videoData, error: fetchError } = await supabaseClient
        .from('generated_videos')
        .select('storage_path')
        .eq('id', videoId)
        .single();

      if (!fetchError && videoData?.storage_path) {
        // Delete from storage
        const { error: storageError } = await supabaseClient.storage
          .from('generated-videos')
          .remove([videoData.storage_path]);

        if (storageError) {
          console.error('Video storage delete error:', storageError);
        }
      }

      // Delete from database
      const { error: dbError } = await supabaseClient
        .from('generated_videos')
        .delete()
        .eq('id', videoId);

      if (dbError) {
        console.error('Video database delete error:', dbError);
        throw dbError;
      }
    } else if (videoUrl && currentUser) {
      // Try to find and delete by URL if no ID (newly generated)
      const { data: videoData, error: fetchError } = await supabaseClient
        .from('generated_videos')
        .select('id, storage_path')
        .eq('public_url', videoUrl)
        .single();

      if (!fetchError && videoData) {
        if (videoData.storage_path) {
          await supabaseClient.storage
            .from('generated-videos')
            .remove([videoData.storage_path]);
        }
        await supabaseClient
          .from('generated_videos')
          .delete()
          .eq('id', videoData.id);
      }
    }

    // Remove from local array
    const index = generatedVideos.findIndex(vid => vid.url === videoUrl);
    if (index > -1) {
      generatedVideos.splice(index, 1);
    }

    // Remove from DOM with animation
    element.style.transition = 'opacity 0.3s, transform 0.3s';
    element.style.opacity = '0';
    element.style.transform = 'scale(0.8)';
    setTimeout(() => element.remove(), 300);

    console.log('Video deleted successfully');
  } catch (error) {
    console.error('Error deleting video:', error);
    alert('Failed to delete video: ' + error.message);
    element.style.opacity = '1';
    element.style.pointerEvents = 'auto';
  }
}

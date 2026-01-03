const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_API_KEY
});

async function listModels() {
  try {
    console.log('Fetching available models...\n');
    const response = await ai.models.list();

    console.log('Response type:', typeof response);
    console.log('Response keys:', Object.keys(response));
    console.log('\nFull response:', JSON.stringify(response, null, 2));

    // Try to access models array
    const modelsList = response.models || response;

    if (Array.isArray(modelsList)) {
      console.log('\n\nImage generation models:');
      console.log('========================');

      for (const model of modelsList) {
        // Check if model supports image generation
        const supportsGenContent = model.supportedGenerationMethods?.includes('generateContent');
        const isImageModel = model.name?.includes('image') || model.name?.includes('imagen') || model.name?.includes('nano');

        if (supportsGenContent && isImageModel) {
          console.log(`\nModel: ${model.name}`);
          console.log(`Display Name: ${model.displayName || 'N/A'}`);
          console.log(`Description: ${model.description || 'N/A'}`);
          console.log(`Supported methods: ${model.supportedGenerationMethods?.join(', ') || 'N/A'}`);
        }
      }
    } else {
      console.log('\nModels list is not an array');
    }
  } catch (error) {
    console.error('Error listing models:', error.message);
    console.error('Full error:', error);
  }
}

listModels();

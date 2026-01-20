/**
 * Generate Prompts Node Executor
 * Uses Grok (via OpenRouter) to generate creative image prompts
 */

const { OpenRouter } = require('@openrouter/sdk');
const { supabase } = require('../supabase');
const { logger } = require('../logger');

// OpenRouter client
const openrouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const GROK_MODEL = "x-ai/grok-4.1-fast";

// Style preset descriptions
const STYLE_PRESETS = {
  'realistic': 'photorealistic, detailed photography, natural lighting, high resolution',
  'anime': 'anime style, manga aesthetic, vibrant colors, cel shading',
  'cinematic': 'cinematic lighting, film still, dramatic composition, movie scene',
  'fantasy': 'fantasy art, magical atmosphere, ethereal lighting, imaginative',
  'glamour': 'glamour photography, fashion editorial, professional lighting, elegant',
  'artistic': 'artistic interpretation, painterly style, creative composition'
};

/**
 * Get character context for prompt generation
 */
async function getCharacterContext(characterId) {
  if (!characterId) return null;

  try {
    // Try main characters table first
    const { data: character } = await supabase
      .from('characters')
      .select('name, prompt_prefix, prompt_suffix, appearance_description')
      .eq('id', characterId)
      .single();

    if (character) {
      return {
        name: character.name,
        appearance: character.appearance_description || '',
        traits: character.prompt_prefix || '',
        suffix: character.prompt_suffix || ''
      };
    }

    // Try marketplace characters
    const { data: marketplaceChar } = await supabase
      .from('marketplace_characters')
      .select('name, description, appearance_description')
      .eq('id', characterId)
      .single();

    if (marketplaceChar) {
      return {
        name: marketplaceChar.name,
        appearance: marketplaceChar.appearance_description || '',
        traits: marketplaceChar.description || '',
        suffix: ''
      };
    }
  } catch (error) {
    logger.warn('Failed to get character context', { error: error.message });
  }

  return null;
}

/**
 * Build the system prompt based on content mode
 */
function buildSystemPrompt(contentMode) {
  if (contentMode === 'nsfw') {
    return `You are an expert adult content prompt engineer for AI image generation. Your job is to create highly detailed, explicit prompts that will produce stunning adult imagery.

Guidelines:
- Be extremely detailed and specific about poses, anatomy, and actions
- Include explicit descriptions of bodies, positions, and scenarios
- Vary the intensity and type of content across prompts
- Include specific details about expressions, angles, and framing
- Make each prompt unique and creative
- Focus on artistic quality alongside explicit content`;
  }

  return `You are an expert image prompt engineer for AI image generation. Your job is to create highly detailed, creative prompts that will produce stunning, safe-for-work imagery.

Guidelines:
- Be extremely detailed about poses, settings, and composition
- All content must be safe for work - no nudity or suggestive content
- Include specific details about clothing, environment, and mood
- Vary lighting, angles, and artistic styles across prompts
- Make each prompt unique and visually interesting
- Focus on artistic quality and creative expression`;
}

/**
 * Build the user prompt for Grok
 */
function buildUserPrompt(config, characterContext) {
  const {
    theme,
    count = 5,
    style = 'realistic',
    include_poses = true,
    include_settings = true
  } = config;

  const styleDesc = STYLE_PRESETS[style] || STYLE_PRESETS['realistic'];

  let prompt = `Generate exactly ${count} unique, detailed image generation prompts for the theme: "${theme}"

Style: ${style} (${styleDesc})`;

  if (characterContext) {
    prompt += `

Character: ${characterContext.name}`;

    // If appearance description is provided, use it as the canonical description
    if (characterContext.appearance) {
      prompt += `

EXACT PHYSICAL APPEARANCE (use this IDENTICAL description in EVERY prompt - do not vary or improvise):
"${characterContext.appearance}"`;
    }

    // Add additional traits/styling hints if available
    if (characterContext.traits) {
      prompt += `

Additional styling notes: ${characterContext.traits}`;
    }

    prompt += `

CRITICAL CHARACTER RULES:
- The character's physical appearance MUST be described identically in every prompt using the exact description above
- Do NOT change hair color, eye color, body type, age, or any physical features between prompts
- Only vary: poses, clothing, settings, lighting, activities, expressions`;
  }

  prompt += `

Requirements:
- Each prompt must be completely different from the others
- Be highly detailed (60-100 words per prompt)`;

  if (include_poses) {
    prompt += `
- Vary poses, body language, and actions across prompts`;
  }

  if (include_settings) {
    prompt += `
- Vary settings, backgrounds, and environments across prompts`;
  }

  prompt += `
- Vary lighting conditions and mood across prompts
- Include specific details about expressions and composition
- Make each prompt ready to use directly for image generation

CRITICAL: Return ONLY a valid JSON array of strings. No markdown, no explanation, no code blocks. Just the raw JSON array like this:
["first prompt here", "second prompt here", "third prompt here"]`;

  return prompt;
}

/**
 * Parse Grok's response to extract prompts array
 */
function parsePromptsResponse(response) {
  // Try to extract JSON array from the response
  let text = response.trim();

  // Remove markdown code blocks if present
  text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

  // Try to find JSON array in the text
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    text = arrayMatch[0];
  }

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.filter(p => typeof p === 'string' && p.trim().length > 0);
    }
  } catch (error) {
    logger.warn('Failed to parse JSON response, trying line-by-line', { error: error.message });
  }

  // Fallback: try to extract prompts line by line
  const lines = text.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 20) // Filter out short lines
    .map(line => {
      // Remove numbering like "1.", "1)", etc.
      return line.replace(/^\d+[\.\)]\s*/, '').replace(/^["']|["']$/g, '');
    })
    .filter(line => line.length > 20);

  if (lines.length > 0) {
    return lines;
  }

  throw new Error('Could not parse prompts from Grok response');
}

/**
 * Execute a Generate Prompts node
 */
async function executeGeneratePrompts(config, userId, context) {
  const {
    theme,
    count = 5,
    content_mode = 'sfw',
    style = 'realistic',
    character_id,
    include_poses = true,
    include_settings = true
  } = config;

  logger.info('Executing Generate Prompts node', {
    theme,
    count,
    content_mode,
    style,
    character_id: !!character_id
  });

  if (!theme) {
    throw new Error('Theme is required');
  }

  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API key not configured');
  }

  // Get character context if provided
  const characterContext = character_id ? await getCharacterContext(character_id) : null;

  // Build prompts for Grok
  const systemPrompt = buildSystemPrompt(content_mode);
  const userPrompt = buildUserPrompt({
    theme,
    count,
    style,
    include_poses,
    include_settings
  }, characterContext);

  logger.info('Calling Grok for prompt generation', {
    model: GROK_MODEL,
    contentMode: content_mode,
    hasCharacter: !!characterContext
  });

  // Call Grok via OpenRouter (non-streaming for workflow)
  const response = await openrouter.chat.send({
    model: GROK_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    max_tokens: 4096,
    stream: false
  });

  const responseText = response.choices?.[0]?.message?.content;

  if (!responseText) {
    throw new Error('No response received from Grok');
  }

  logger.info('Grok response received', {
    responseLength: responseText.length
  });

  // Parse the response to extract prompts
  const prompts = parsePromptsResponse(responseText);

  if (prompts.length === 0) {
    throw new Error('No valid prompts generated');
  }

  logger.info('Generate Prompts node completed', {
    promptCount: prompts.length,
    requestedCount: count
  });

  // Credit cost for prompt generation (1 credit per request regardless of count)
  const creditsUsed = 1;

  // Deduct credits
  const { error: creditError } = await supabase.rpc('deduct_credits', {
    p_user_id: userId,
    p_amount: creditsUsed,
    p_description: `Workflow: Generate Prompts (${prompts.length} prompts)`
  });

  if (creditError) {
    logger.warn('Failed to deduct credits', { error: creditError.message });
  }

  return {
    output: {
      prompts,
      prompt_count: prompts.length,
      theme,
      style,
      content_mode
    },
    creditsUsed
  };
}

module.exports = { executeGeneratePrompts };

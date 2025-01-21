import { generateObject, generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { kv } from '@vercel/kv';
import { Ratelimit } from '@upstash/ratelimit';
import { AI_TEXT_GENERATION_ENABLED, HAS_VERCEL_KV } from '@/site/config';
import { removeBase64Prefix } from '@/utility/image';
import { cleanUpAiTextResponse } from '@/photo/ai';
import { z } from 'zod';

/* eslint-disable max-len */

const RATE_LIMIT_IDENTIFIER = 'openai-image-query';
const RATE_LIMIT_MAX_QUERIES_PER_HOUR = 100;
const MODEL = process.env.OPENAI_MODEL || 'gemini-1.5-flash';

export const imageAnalysisSchema = z.object({
  title: z.string().max(30).describe('A concise title for the image in 3 words or less'),
  caption: z.string().max(60).describe('A brief caption for the image in 6 words or less, without punctuation'),
  tags: z.array(z.string()).max(3).describe('Up to 3 keywords describing the image, avoiding adjectives and adverbs'),
  semanticDescription: z.string().describe('A brief description of the image without introductory phrases'),
});

export const AI_IMAGE_PROMPT = 'Analyze this image and provide the following details in JSON format:\n' +
  '- A concise title in 3 words or less\n' +
  '- A brief caption in 6 words or less without punctuation\n' +
  '- Up to 3 keywords describing key elements, avoiding adjectives and adverbs\n' +
  '- A brief semantic description without introductory phrases';

export type ImageAnalysis = z.infer<typeof imageAnalysisSchema>;

const ai = AI_TEXT_GENERATION_ENABLED
  ? createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_SECRET_KEY,
  })
  : undefined;
console.log(AI_TEXT_GENERATION_ENABLED, ai);


const ratelimit = HAS_VERCEL_KV
  ? new Ratelimit({
    redis: kv,
    limiter: Ratelimit.slidingWindow(RATE_LIMIT_MAX_QUERIES_PER_HOUR, '1h'),
  })
  : undefined;

// Allows 100 requests per hour
const checkRateLimitAndBailIfNecessary = async () => {
  if (ratelimit) {
    let success = false;
    try {
      success = (await ratelimit.limit(RATE_LIMIT_IDENTIFIER)).success;
    } catch (e: any) {
      console.error('Failed to rate limit OpenAI', e);
      throw new Error('Failed to rate limit OpenAI');
    }
    if (!success) {
      console.error('OpenAI rate limit exceeded');
      throw new Error('OpenAI rate limit exceeded');
    }
  }
};

export const generateOpenAiImageAnalysis = async (
  imageBase64: string,
) => {
  await checkRateLimitAndBailIfNecessary();
  console.log('Generating AI image analysis', ai);
  if (!ai) {
    return {
      title: '',
      caption: '',
      tags: [],
      semanticDescription: '',
    };
  }
  const { object } = await generateObject({
    model: ai(MODEL),
    schema: imageAnalysisSchema,
    messages: [{
      'role': 'user',
      'content': [
        {
          'type': 'text',
          'text': AI_IMAGE_PROMPT,
        }, {
          'type': 'image',
          'image': removeBase64Prefix(imageBase64),
        },
      ],
    }],
  });

  return {
    title: cleanUpAiTextResponse(object.title),
    caption: cleanUpAiTextResponse(object.caption),
    tags: object.tags.map(tag => cleanUpAiTextResponse(tag)),
    semanticDescription: cleanUpAiTextResponse(object.semanticDescription),
  };
};

export const testOpenAiConnection = async () => {
  await checkRateLimitAndBailIfNecessary();

  if (ai) {
    return generateText({
      model: ai(MODEL),
      messages: [{
        'role': 'user',
        'content': [
          {
            'type': 'text',
            'text': 'Test connection',
          },
        ],
      }],
    });
  }
};

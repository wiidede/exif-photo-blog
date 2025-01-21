import { generateObject, generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { kv } from '@vercel/kv';
import { Ratelimit } from '@upstash/ratelimit';
import { AI_TEXT_GENERATION_ENABLED, HAS_VERCEL_KV } from '@/site/config';
import { removeBase64Prefix } from '@/utility/image';
import { cleanUpAiTextResponse } from '@/photo/ai';
import { z } from 'zod';

const RATE_LIMIT_IDENTIFIER = 'openai-image-query';
const RATE_LIMIT_MAX_QUERIES_PER_HOUR = 100;
const MODEL = process.env.OPENAI_MODEL || 'gemini-1.5-flash';

export const imageAnalysisSchema = z.object({
  title: z.string().max(20).describe('为图片生成一个不超过20个字的简洁标题'),
  caption: z.string().max(30).describe('用不超过6个词描述图片要点，无需标点符号'),
  tags: z.array(z.string()).max(4).describe('最多3个关键词标签，用于描述图片主要元素，避免使用形容词和副词'),
  semanticDescription: z.string().describe('简要描述图片内容，直接描述要点，无需引导性语句'),
});

export const AI_IMAGE_PROMPT = '请分析这张图片并以JSON格式提供以下信息：\n' +
  '- 一个不超过不超过20个字的简洁标题\n' +
  '- 用不超过6个词描述图片要点，无需标点符号\n' +
  '- 最多3个关键词标签，用于描述主要元素（避免形容词和副词）\n' +
  '- 简要直接地描述图片内容，无需引导性语句';

export type ImageAnalysis = z.infer<typeof imageAnalysisSchema>;

const ai = AI_TEXT_GENERATION_ENABLED
  ? createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_SECRET_KEY,
  })
  : undefined;


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

import { generateOpenAiImageAnalysis } from '@/services/openai';

export const generateAiImageQuery = async (
  imageBase64?: string,
): Promise<{
  title?: string
  caption?: string
  tags?: string
  semanticDescription?: string
  error?: string
}> => {
  let title: string | undefined;
  let caption: string | undefined;
  let tags: string | undefined;
  let semanticDescription: string | undefined;
  let error: string | undefined;

  try {
    if (imageBase64) {
      const analysis = await generateOpenAiImageAnalysis(imageBase64);
      title = analysis.title;
      caption = analysis.caption;
      tags = analysis.tags.join(', ');
      semanticDescription = analysis.semanticDescription;
    }
  } catch (e: any) {
    error = e.message;
    console.log('Error generating AI image text', e.message);
  }

  return {
    title,
    caption,
    tags,
    semanticDescription,
    error,
  };
};

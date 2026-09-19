import { Injectable } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';

const EMBEDDING_MODEL = 'gemini-embedding-2';
const OUTPUT_DIMENSIONALITY = 768;

@Injectable()
export class GeminiEmbeddingService {
  private readonly client: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is required for document retrieval');
    }

    this.client = new GoogleGenAI({ apiKey });
  }

  async embedDocument(text: string, title: string): Promise<number[]> {
    const preparedText = `title: ${title} | text: ${text}`;

    return this.embed(preparedText);
  }

  async embedQuery(query: string): Promise<number[]> {
    const preparedQuery = `task: question answering | query: ${query}`;

    return this.embed(preparedQuery);
  }

  private async embed(text: string): Promise<number[]> {
    const response = await this.client.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
      config: {
        outputDimensionality: OUTPUT_DIMENSIONALITY,
      },
    });

    const values = response.embeddings?.[0]?.values;

    if (!values?.length) {
      throw new Error('Gemini returned no embedding values');
    }

    return [...values];
  }
}

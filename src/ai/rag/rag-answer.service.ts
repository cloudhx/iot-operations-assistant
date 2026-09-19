import { Injectable } from '@nestjs/common';
import { GeminiClientService } from '../gemini/gemini-client.service.js';
import { DocumentRetrievalService } from './document-retrieval.service.js';
import { RagContextBuilderService } from './rag-context-builder.service.js';
import { RAG_ANSWER_SYSTEM_INSTRUCTION } from './rag-answer.prompt.js';
import type { RagAnswerResult } from './rag-answer.types.js';

const DEFAULT_TOP_K = 3;

@Injectable()
export class RagAnswerService {
  constructor(
    private readonly retrievalService: DocumentRetrievalService,
    private readonly contextBuilder: RagContextBuilderService,
    private readonly geminiClient: GeminiClientService,
  ) {}

  async answer(
    question: string,
    topK = DEFAULT_TOP_K,
  ): Promise<RagAnswerResult> {
    const normalizedQuestion = question.trim();

    if (!normalizedQuestion) {
      throw new Error('RAG question must not be empty');
    }

    await this.retrievalService.initialize();

    const retrievalResults = await this.retrievalService.search(
      normalizedQuestion,
      topK,
    );

    const retrievedContext = this.contextBuilder.build(retrievalResults);

    const modelInput = [
      retrievedContext,
      '',
      'User question:',
      normalizedQuestion,
    ].join('\n');

    const turn = await this.geminiClient.startInteraction(
      modelInput,
      [],
      RAG_ANSWER_SYSTEM_INSTRUCTION,
    );

    const answer = turn.outputText?.trim();

    if (!answer) {
      throw new Error('Gemini returned no text for the RAG answer');
    }

    return {
      answer,
      retrievedChunks: retrievalResults.map((result) => ({
        id: result.chunk.id,
        source: result.chunk.source,
        section: result.chunk.section,
        similarity: result.similarity,
      })),
    };
  }
}

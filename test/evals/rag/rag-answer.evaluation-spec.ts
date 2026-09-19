import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GeminiClientService } from '../../../src/ai/gemini/gemini-client.service.js';
import { DocumentRetrievalService } from '../../../src/ai/rag/document-retrieval.service.js';
import { GeminiEmbeddingService } from '../../../src/ai/rag/gemini-embedding.service.js';
import { InMemoryVectorStoreService } from '../../../src/ai/rag/in-memory-vector-store.service.js';
import { MarkdownDocumentChunkerService } from '../../../src/ai/rag/markdown-document-chunker.service.js';
import { RagAnswerService } from '../../../src/ai/rag/rag-answer.service.js';
import { RagContextBuilderService } from '../../../src/ai/rag/rag-context-builder.service.js';
import { RAG_ANSWER_EVALUATION_CASES } from './rag-answer.evaluation-cases.js';

describe('RAG answer evaluation', () => {
  let testingModule: TestingModule;
  let ragAnswerService: RagAnswerService;
  let retrievalService: DocumentRetrievalService;

  beforeAll(async () => {
    testingModule = await Test.createTestingModule({
      providers: [
        RagAnswerService,
        RagContextBuilderService,
        DocumentRetrievalService,
        MarkdownDocumentChunkerService,
        GeminiEmbeddingService,
        InMemoryVectorStoreService,
        GeminiClientService,
      ],
    }).compile();

    ragAnswerService = testingModule.get(RagAnswerService);
    retrievalService = testingModule.get(DocumentRetrievalService);

    await retrievalService.initialize();
  }, 120_000);

  afterAll(async () => {
    await testingModule.close();
  });

  for (const evaluationCase of RAG_ANSWER_EVALUATION_CASES) {
    it(`${evaluationCase.id}: answers from retrieved maintenance knowledge`, async () => {
      const result = await ragAnswerService.answer(evaluationCase.question);

      console.log(`\n[${evaluationCase.id}]`);
      console.log(`Question: ${evaluationCase.question}`);
      console.log('Retrieved chunks:');

      for (const [index, chunk] of result.retrievedChunks.entries()) {
        console.log(
          [
            `  ${index + 1}. ${chunk.id}`,
            `section=${chunk.section ?? 'Unspecified'}`,
            `similarity=${chunk.similarity.toFixed(4)}`,
          ].join(' | '),
        );
      }

      console.log(`Answer: ${result.answer}`);

      console.log('Manual expectations:');

      for (const characteristic of evaluationCase.expectedAnswerCharacteristics) {
        console.log(`  - ${characteristic}`);
      }

      console.log('Failure indicators:');

      for (const indicator of evaluationCase.failureIndicators) {
        console.log(`  - ${indicator}`);
      }

      expect(result.answer.length).toBeGreaterThan(0);
      expect(result.retrievedChunks.length).toBeGreaterThan(0);

      if (evaluationCase.expectedSections.length > 0) {
        const retrievedSections = new Set(
          result.retrievedChunks
            .map((chunk) => chunk.section)
            .filter((section): section is string => Boolean(section)),
        );

        expect(
          evaluationCase.expectedSections.some((section) =>
            retrievedSections.has(section),
          ),
        ).toBe(true);
      }
    }, 60_000);
  }
});

import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DocumentRetrievalService } from '../../../../src/ai/rag/document-retrieval.service.js';
import { GeminiEmbeddingService } from '../../../../src/ai/rag/gemini-embedding.service.js';
import { InMemoryVectorStoreService } from '../../../../src/ai/rag/in-memory-vector-store.service.js';
import { MarkdownDocumentChunkerService } from '../../../../src/ai/rag/markdown-document-chunker.service.js';

interface RetrievalCase {
  id: string;
  query: string;
  expectedSection: string;
}

const RETRIEVAL_CASES: RetrievalCase[] = [
  {
    id: 'RETRIEVAL-001',
    query:
      'What should a technician inspect when a motor bearing requires maintenance?',
    expectedSection: 'Inspection Procedure',
  },
  {
    id: 'RETRIEVAL-002',
    query: 'How should vibration readings be interpreted?',
    expectedSection: 'Understanding Vibration Readings',
  },
  {
    id: 'RETRIEVAL-003',
    query:
      'What additional information is needed before deciding whether a temperature value is abnormal?',
    expectedSection: 'Temperature Observations',
  },
];

describe('Document retrieval', () => {
  let testingModule: TestingModule;
  let retrievalService: DocumentRetrievalService;

  beforeAll(async () => {
    testingModule = await Test.createTestingModule({
      providers: [
        DocumentRetrievalService,
        MarkdownDocumentChunkerService,
        GeminiEmbeddingService,
        InMemoryVectorStoreService,
      ],
    }).compile();

    retrievalService = testingModule.get(DocumentRetrievalService);
    await retrievalService.initialize();
  }, 120_000);

  afterAll(async () => {
    await testingModule.close();
  });

  for (const retrievalCase of RETRIEVAL_CASES) {
    it(`${retrievalCase.id}: retrieves relevant maintenance guidance`, async () => {
      const results = await retrievalService.search(retrievalCase.query, 3);

      console.log(`\n[${retrievalCase.id}]`);
      console.log(`Query: ${retrievalCase.query}`);

      for (const [index, result] of results.entries()) {
        const snippet = result.chunk.text.replace(/\s+/g, ' ').slice(0, 240);

        console.log(`${index + 1}. ${result.chunk.id}`);
        console.log(`   Section: ${result.chunk.section ?? 'Unknown'}`);
        console.log(`   Similarity: ${result.similarity.toFixed(4)}`);
        console.log(`   Snippet: ${snippet}...`);
      }

      expect(results).toHaveLength(3);

      expect(
        results.some(
          (result) => result.chunk.section === retrievalCase.expectedSection,
        ),
      ).toBe(true);

      for (let index = 1; index < results.length; index += 1) {
        expect(results[index - 1].similarity).toBeGreaterThanOrEqual(
          results[index].similarity,
        );
      }
    }, 30_000);
  }
});

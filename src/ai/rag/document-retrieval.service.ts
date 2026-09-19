import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import type { DocumentSearchResult } from './document-chunk.js';
import { GeminiEmbeddingService } from './gemini-embedding.service.js';
import { InMemoryVectorStoreService } from './in-memory-vector-store.service.js';
import { MarkdownDocumentChunkerService } from './markdown-document-chunker.service.js';

const DOCUMENT_SOURCE = 'motor-bearing-maintenance.md';
const DOCUMENT_PATH = join(process.cwd(), 'knowledge-base', DOCUMENT_SOURCE);

@Injectable()
export class DocumentRetrievalService {
  private readonly logger = new Logger(DocumentRetrievalService.name);
  private initialized = false;

  constructor(
    private readonly chunker: MarkdownDocumentChunkerService,
    private readonly embeddingService: GeminiEmbeddingService,
    private readonly vectorStore: InMemoryVectorStoreService,
  ) {}

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const markdown = await readFile(DOCUMENT_PATH, 'utf8');
    const chunks = this.chunker.chunk(DOCUMENT_SOURCE, markdown);

    if (chunks.length === 0) {
      throw new Error(`No chunks were produced from ${DOCUMENT_SOURCE}`);
    }

    this.vectorStore.clear();

    for (const chunk of chunks) {
      const embedding = await this.embeddingService.embedDocument(
        chunk.text,
        chunk.section ?? chunk.source,
      );

      this.vectorStore.add(chunk, embedding);
    }

    this.initialized = true;

    this.logger.log(
      `Indexed ${this.vectorStore.size} chunks from ${DOCUMENT_SOURCE}`,
    );
  }

  async search(query: string, topK = 3): Promise<DocumentSearchResult[]> {
    if (!this.initialized) {
      throw new Error(
        'DocumentRetrievalService must be initialized before searching',
      );
    }

    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
      throw new Error('Search query must not be empty');
    }

    const queryEmbedding =
      await this.embeddingService.embedQuery(normalizedQuery);

    return this.vectorStore.search(queryEmbedding, topK);
  }
}

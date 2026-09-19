import { Injectable } from '@nestjs/common';
import type {
  DocumentChunk,
  DocumentSearchResult,
  StoredDocumentChunk,
} from './document-chunk.js';

@Injectable()
export class InMemoryVectorStoreService {
  private entries: StoredDocumentChunk[] = [];

  get size(): number {
    return this.entries.length;
  }

  clear(): void {
    this.entries = [];
  }

  add(chunk: DocumentChunk, embedding: number[]): void {
    this.entries.push({
      chunk,
      embedding: [...embedding],
    });
  }

  search(queryEmbedding: number[], topK = 3): DocumentSearchResult[] {
    if (!Number.isInteger(topK) || topK <= 0) {
      throw new Error('topK must be a positive integer');
    }

    return this.entries
      .map(({ chunk, embedding }) => ({
        chunk,
        similarity: cosineSimilarity(queryEmbedding, embedding),
      }))
      .sort((left, right) => right.similarity - left.similarity)
      .slice(0, topK);
  }
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || right.length === 0) {
    throw new Error('Cannot compare empty embedding vectors');
  }

  if (left.length !== right.length) {
    throw new Error(
      `Embedding dimensions do not match: ${left.length} and ${right.length}`,
    );
  }

  let dotProduct = 0;
  let leftMagnitudeSquared = 0;
  let rightMagnitudeSquared = 0;

  for (let index = 0; index < left.length; index += 1) {
    dotProduct += left[index] * right[index];
    leftMagnitudeSquared += left[index] * left[index];
    rightMagnitudeSquared += right[index] * right[index];
  }

  const denominator =
    Math.sqrt(leftMagnitudeSquared) * Math.sqrt(rightMagnitudeSquared);

  if (denominator === 0) {
    throw new Error('Cannot compare zero-magnitude embedding vectors');
  }

  return dotProduct / denominator;
}

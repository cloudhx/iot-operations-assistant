export interface DocumentChunk {
  id: string;
  source: string;
  section?: string;
  text: string;
}

export interface StoredDocumentChunk {
  chunk: DocumentChunk;
  embedding: number[];
}

export interface DocumentSearchResult {
  chunk: DocumentChunk;
  similarity: number;
}

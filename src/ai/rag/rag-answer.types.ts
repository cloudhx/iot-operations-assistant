export interface RetrievedChunkMetadata {
  id: string;
  source: string;
  section?: string;
  similarity: number;
}

export interface RagAnswerResult {
  answer: string;
  retrievedChunks: RetrievedChunkMetadata[];
}

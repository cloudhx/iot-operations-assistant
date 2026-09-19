import { Injectable, Logger } from '@nestjs/common';
import type {
  GeminiFunctionCall,
  GeminiFunctionResult,
} from '../gemini/gemini.types.js';
import type { AiRetrievalTrace } from '../observability/ai-interaction-trace.model.js';
import { DocumentRetrievalService } from '../rag/document-retrieval.service.js';
import { SEARCH_MAINTENANCE_KNOWLEDGE_TOOL_NAME } from './maintenance-knowledge.tool.js';

const MAINTENANCE_RETRIEVAL_TOP_K = 3;

export interface MaintenanceKnowledgeExecution {
  functionResult: GeminiFunctionResult;
  retrieval: AiRetrievalTrace;
}

@Injectable()
export class MaintenanceKnowledgeToolExecutorService {
  private readonly logger = new Logger(
    MaintenanceKnowledgeToolExecutorService.name,
  );

  constructor(private readonly retrievalService: DocumentRetrievalService) {}

  async execute(call: GeminiFunctionCall): Promise<GeminiFunctionResult> {
    const execution = await this.executeWithTraceMetadata(call);
    return execution.functionResult;
  }

  async executeWithTraceMetadata(
    call: GeminiFunctionCall,
  ): Promise<MaintenanceKnowledgeExecution> {
    if (call.name !== SEARCH_MAINTENANCE_KNOWLEDGE_TOOL_NAME) {
      throw new Error(`Unsupported maintenance knowledge tool: ${call.name}`);
    }

    const query = this.requireQuery(call.arguments);

    this.logger.debug(`Searching maintenance knowledge for query: ${query}`);

    await this.retrievalService.initialize();

    const retrievalResults = await this.retrievalService.search(
      query,
      MAINTENANCE_RETRIEVAL_TOP_K,
    );

    this.logger.debug(
      `Retrieved maintenance chunks: ${retrievalResults
        .map(
          ({ chunk, similarity }) => `${chunk.id} (${similarity.toFixed(4)})`,
        )
        .join(', ')}`,
    );

    return {
      functionResult: {
        callId: call.id,
        name: call.name,
        result: {
          query,
          results: retrievalResults.map(({ chunk }) => ({
            id: chunk.id,
            source: chunk.source,
            section: chunk.section,
            text: chunk.text,
          })),
        },
      },
      retrieval: {
        query,
        resultCount: retrievalResults.length,
        chunks: retrievalResults.map(({ chunk, similarity }) => ({
          id: chunk.id,
          source: chunk.source,
          section: chunk.section,
          similarity,
        })),
      },
    };
  }

  private requireQuery(args: Record<string, unknown>): string {
    const query = args.query;

    if (typeof query !== 'string' || query.trim().length === 0) {
      throw new Error(
        `${SEARCH_MAINTENANCE_KNOWLEDGE_TOOL_NAME} requires a non-empty string argument "query"`,
      );
    }

    return query.trim();
  }
}

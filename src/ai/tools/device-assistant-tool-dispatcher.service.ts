import { Injectable, Logger } from '@nestjs/common';

import type {
  GeminiFunctionCall,
  GeminiFunctionResult,
} from '../gemini/gemini.types.js';
import {
  AI_TOOL_CALL_STATUSES,
  AI_TOOL_CATEGORIES,
  AiActionProposalTrace,
  AiRetrievalTrace,
  AiToolCallTrace,
  AiToolCategory,
} from '../observability/ai-interaction-trace.model.js';
import { DeviceToolExecutorService } from './device-tool-executor.service.js';
import { DEVICE_TOOL_NAMES } from './device-tools.js';
import { MaintenanceKnowledgeToolExecutorService } from './maintenance-knowledge-tool-executor.service.js';
import { SEARCH_MAINTENANCE_KNOWLEDGE_TOOL_NAME } from './maintenance-knowledge.tool.js';
import { MaintenanceWorkOrderToolExecutorService } from './maintenance-work-order-tool-executor.service.js';
import { CREATE_MAINTENANCE_WORK_ORDER_TOOL_NAME } from './maintenance-work-order.tool.js';

export interface DispatchedToolExecution {
  functionResult: GeminiFunctionResult;
  trace: AiToolCallTrace;
}

interface ToolExecutorOutcome {
  functionResult: GeminiFunctionResult;
  retrieval?: AiRetrievalTrace;
  actionProposal?: AiActionProposalTrace;
}

export class AiToolExecutionError extends Error {
  constructor(
    public readonly toolTrace: AiToolCallTrace,
    cause: unknown,
  ) {
    super(
      `AI tool "${toolTrace.name}" failed: ${
        cause instanceof Error ? cause.message : 'Unknown failure'
      }`,
    );
    this.name = AiToolExecutionError.name;
  }
}

@Injectable()
export class DeviceAssistantToolDispatcherService {
  private readonly logger = new Logger(
    DeviceAssistantToolDispatcherService.name,
  );

  constructor(
    private readonly deviceTools: DeviceToolExecutorService,
    private readonly maintenanceKnowledge: MaintenanceKnowledgeToolExecutorService,
    private readonly maintenanceWorkOrder: MaintenanceWorkOrderToolExecutorService,
  ) {}

  execute(call: GeminiFunctionCall): Promise<DispatchedToolExecution> {
    switch (call.name) {
      case DEVICE_TOOL_NAMES.GET_DEVICE:
      case DEVICE_TOOL_NAMES.GET_LATEST_TELEMETRY:
      case DEVICE_TOOL_NAMES.GET_RECENT_EVENTS:
        this.logger.debug(`Dispatching read-only device tool "${call.name}"`);
        return this.executeTraced(call, AI_TOOL_CATEGORIES.READ, async () => ({
          functionResult: await this.deviceTools.execute(call),
        }));

      case SEARCH_MAINTENANCE_KNOWLEDGE_TOOL_NAME:
        this.logger.debug(
          `Dispatching read-only retrieval tool "${call.name}"`,
        );
        return this.executeTraced(call, AI_TOOL_CATEGORIES.RETRIEVAL, () =>
          this.maintenanceKnowledge.executeWithTraceMetadata(call),
        );

      case CREATE_MAINTENANCE_WORK_ORDER_TOOL_NAME:
        this.logger.debug(
          `Dispatching side-effecting action proposal "${call.name}"`,
        );
        return this.executeTraced(
          call,
          AI_TOOL_CATEGORIES.ACTION_PROPOSAL,
          async () => {
            const functionResult =
              await this.maintenanceWorkOrder.execute(call);

            return {
              functionResult,
              actionProposal: this.readActionProposalMetadata(functionResult),
            };
          },
        );

      default:
        throw new Error(`Unknown AI tool "${call.name}"`);
    }
  }

  private async executeTraced(
    call: GeminiFunctionCall,
    category: AiToolCategory,
    executor: () => Promise<ToolExecutorOutcome>,
  ): Promise<DispatchedToolExecution> {
    const startedAt = Date.now();

    try {
      const outcome = await executor();

      return {
        functionResult: outcome.functionResult,
        trace: {
          callId: call.id,
          name: call.name,
          category,
          arguments: structuredClone(call.arguments),
          latencyMs: Date.now() - startedAt,
          status: AI_TOOL_CALL_STATUSES.SUCCEEDED,
          ...(outcome.retrieval ? { retrieval: outcome.retrieval } : {}),
          ...(outcome.actionProposal
            ? { actionProposal: outcome.actionProposal }
            : {}),
        },
      };
    } catch (error) {
      throw new AiToolExecutionError(
        {
          callId: call.id,
          name: call.name,
          category,
          arguments: structuredClone(call.arguments),
          latencyMs: Date.now() - startedAt,
          status: AI_TOOL_CALL_STATUSES.FAILED,
          error: {
            message: error instanceof Error ? error.message : 'Unknown failure',
          },
        },
        error,
      );
    }
  }

  private readActionProposalMetadata(
    functionResult: GeminiFunctionResult,
  ): AiActionProposalTrace {
    const result = functionResult.result;

    if (
      typeof result !== 'object' ||
      result === null ||
      !('status' in result) ||
      result.status !== 'approval_required' ||
      !('actionId' in result) ||
      typeof result.actionId !== 'string'
    ) {
      throw new Error(
        'Maintenance work-order proposal returned an invalid approval result',
      );
    }

    return {
      pendingActionId: result.actionId,
      pendingStatus: 'PENDING_APPROVAL',
    };
  }
}

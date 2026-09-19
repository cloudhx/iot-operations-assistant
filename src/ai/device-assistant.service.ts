import { Injectable, Logger } from '@nestjs/common';

import { DEVICE_ASSISTANT_SYSTEM_INSTRUCTION } from './device-assistant.prompt.js';
import { GeminiClientService } from './gemini/gemini-client.service.js';
import { GeminiFunctionResult, GeminiTurn } from './gemini/gemini.types.js';
import {
  AI_INTERACTION_OUTCOMES,
  AiFailureStage,
} from './observability/ai-interaction-trace.model.js';
import { AiTraceService } from './observability/ai-trace.service.js';
import {
  AiToolExecutionError,
  DeviceAssistantToolDispatcherService,
  DispatchedToolExecution,
} from './tools/device-assistant-tool-dispatcher.service.js';
import { DEVICE_TOOLS } from './tools/device-tools.js';
import { SEARCH_MAINTENANCE_KNOWLEDGE_TOOL } from './tools/maintenance-knowledge.tool.js';
import { CREATE_MAINTENANCE_WORK_ORDER_TOOL } from './tools/maintenance-work-order.tool.js';

const MAX_TOOL_ROUNDS = 5;
const DEVICE_ASSISTANT_TOOLS = [
  ...DEVICE_TOOLS,
  SEARCH_MAINTENANCE_KNOWLEDGE_TOOL,
  CREATE_MAINTENANCE_WORK_ORDER_TOOL,
];

@Injectable()
export class DeviceAssistantService {
  private readonly logger = new Logger(DeviceAssistantService.name);

  constructor(
    private readonly geminiClient: GeminiClientService,
    private readonly toolDispatcher: DeviceAssistantToolDispatcherService,
    private readonly traceService: AiTraceService,
  ) {}

  async askDeviceAssistant(input: string): Promise<string> {
    if (input.trim().length === 0) {
      throw new Error('Device assistant input must not be empty');
    }

    const traceId = this.traceService.startInteraction(input);
    let failureStage: AiFailureStage = 'MODEL_CALL';

    try {
      let turn = await this.executeModelCall(traceId, 1, () =>
        this.geminiClient.startInteraction(
          input,
          DEVICE_ASSISTANT_TOOLS,
          DEVICE_ASSISTANT_SYSTEM_INSTRUCTION,
        ),
      );

      let completedToolRounds = 0;
      let actionProposalObserved = false;

      while (turn.functionCalls.length > 0) {
        failureStage = 'ORCHESTRATION';

        if (completedToolRounds >= MAX_TOOL_ROUNDS) {
          throw new Error(
            `Gemini exceeded the maximum of ${MAX_TOOL_ROUNDS} tool-call rounds`,
          );
        }

        const currentRound = completedToolRounds + 1;

        this.logger.debug(
          `Gemini requested ${turn.functionCalls.length} tool call(s) in round ${currentRound}`,
        );

        for (const call of turn.functionCalls) {
          this.logger.debug(
            `Requested tool \"${call.name}\" with arguments ${JSON.stringify(call.arguments)}`,
          );
        }

        failureStage = 'TOOL_EXECUTION';
        const settledToolExecutions = await Promise.allSettled(
          turn.functionCalls.map((call) => this.toolDispatcher.execute(call)),
        );
        const toolExecutions: DispatchedToolExecution[] = [];
        let firstToolError: unknown;

        for (const settledExecution of settledToolExecutions) {
          if (settledExecution.status === 'fulfilled') {
            const execution = settledExecution.value;
            toolExecutions.push(execution);
            this.traceService.recordToolCall(
              traceId,
              currentRound,
              execution.trace,
            );
            actionProposalObserved ||= Boolean(execution.trace.actionProposal);
            continue;
          }

          const error = settledExecution.reason;
          firstToolError ??= error;

          if (error instanceof AiToolExecutionError) {
            this.traceService.recordToolCall(
              traceId,
              currentRound,
              error.toolTrace,
            );
          }
        }

        if (firstToolError !== undefined) {
          throw firstToolError;
        }

        const functionResults: GeminiFunctionResult[] = toolExecutions.map(
          ({ functionResult }) => functionResult,
        );

        failureStage = 'MODEL_CALL';
        turn = await this.executeModelCall(traceId, currentRound + 1, () =>
          this.geminiClient.continueWithFunctionResults(
            turn.id,
            functionResults,
            DEVICE_ASSISTANT_TOOLS,
            DEVICE_ASSISTANT_SYSTEM_INSTRUCTION,
          ),
        );

        completedToolRounds += 1;
      }

      this.logger.debug(
        `Gemini completed after ${completedToolRounds} tool-call round(s)`,
      );

      failureStage = 'FINAL_RESPONSE';

      if (turn.outputText.trim().length === 0) {
        throw new Error(
          'Gemini completed the interaction without returning an answer',
        );
      }

      this.traceService.completeInteraction(
        traceId,
        actionProposalObserved
          ? AI_INTERACTION_OUTCOMES.APPROVAL_REQUIRED
          : AI_INTERACTION_OUTCOMES.ANSWERED,
      );

      return turn.outputText;
    } catch (error) {
      this.traceService.failInteraction(traceId, failureStage, error);
      throw error;
    }
  }

  private async executeModelCall(
    traceId: string,
    round: number,
    operation: () => Promise<GeminiTurn>,
  ): Promise<GeminiTurn> {
    const startedAt = Date.now();

    try {
      return await operation();
    } finally {
      this.traceService.recordModelCall(traceId, round, Date.now() - startedAt);
    }
  }
}

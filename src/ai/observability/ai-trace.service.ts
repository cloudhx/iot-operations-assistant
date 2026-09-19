import { Injectable } from '@nestjs/common';

import {
  AI_INTERACTION_OUTCOMES,
  AI_TOOL_CATEGORIES,
  AiFailureStage,
  AiInteractionOutcome,
  AiInteractionRound,
  AiInteractionTrace,
  AiToolCallTrace,
} from './ai-interaction-trace.model.js';

@Injectable()
export class AiTraceService {
  private readonly traces = new Map<string, AiInteractionTrace>();
  private latestInteractionId?: string;
  private nextId = 1;

  startInteraction(input: string): string {
    const interactionId = `ai-interaction-${String(this.nextId).padStart(3, '0')}`;
    this.nextId += 1;

    this.traces.set(interactionId, {
      interactionId,
      input,
      startedAt: new Date(),
      rounds: [],
      modelCallCount: 0,
      toolCallCount: 0,
      retrievalCallCount: 0,
      actionProposalCount: 0,
      pendingActionIds: [],
    });
    this.latestInteractionId = interactionId;

    return interactionId;
  }

  recordModelCall(
    interactionId: string,
    roundNumber: number,
    latencyMs: number,
  ): void {
    const trace = this.requireMutableTrace(interactionId);

    if (trace.rounds.some(({ round }) => round === roundNumber)) {
      throw new Error(
        `Model call for interaction "${interactionId}" round ${roundNumber} was already recorded`,
      );
    }

    const round: AiInteractionRound = {
      round: roundNumber,
      modelLatencyMs: latencyMs,
      toolCalls: [],
    };

    trace.rounds.push(round);
    trace.rounds.sort((left, right) => left.round - right.round);
    trace.modelCallCount += 1;
  }

  recordToolCall(
    interactionId: string,
    roundNumber: number,
    toolCall: AiToolCallTrace,
  ): void {
    const trace = this.requireMutableTrace(interactionId);
    const round = trace.rounds.find(({ round }) => round === roundNumber);

    if (!round) {
      throw new Error(
        `Cannot record a tool call before model round ${roundNumber} for interaction "${interactionId}"`,
      );
    }

    round.toolCalls.push(structuredClone(toolCall));
    trace.toolCallCount += 1;

    if (toolCall.category === AI_TOOL_CATEGORIES.RETRIEVAL) {
      trace.retrievalCallCount += 1;
    }

    if (
      toolCall.category === AI_TOOL_CATEGORIES.ACTION_PROPOSAL &&
      toolCall.actionProposal
    ) {
      trace.actionProposalCount += 1;

      const pendingActionId = toolCall.actionProposal.pendingActionId;
      if (
        pendingActionId &&
        !trace.pendingActionIds.includes(pendingActionId)
      ) {
        trace.pendingActionIds.push(pendingActionId);
      }
    }
  }

  completeInteraction(
    interactionId: string,
    outcome: Exclude<AiInteractionOutcome, 'FAILED'>,
  ): void {
    const trace = this.requireMutableTrace(interactionId);
    this.finish(trace, outcome);
  }

  failInteraction(
    interactionId: string,
    stage: AiFailureStage,
    error: unknown,
  ): void {
    const trace = this.requireMutableTrace(interactionId);
    trace.failure = {
      stage,
      message: error instanceof Error ? error.message : 'Unknown failure',
    };
    this.finish(trace, AI_INTERACTION_OUTCOMES.FAILED);
  }

  findLatest(): AiInteractionTrace | undefined {
    return this.latestInteractionId
      ? this.findById(this.latestInteractionId)
      : undefined;
  }

  findById(interactionId: string): AiInteractionTrace | undefined {
    const trace = this.traces.get(interactionId);
    return trace ? structuredClone(trace) : undefined;
  }

  findAll(): AiInteractionTrace[] {
    return [...this.traces.values()].map((trace) => structuredClone(trace));
  }

  private finish(
    trace: AiInteractionTrace,
    outcome: AiInteractionOutcome,
  ): void {
    if (trace.completedAt) {
      throw new Error(
        `Interaction "${trace.interactionId}" is already complete`,
      );
    }

    trace.completedAt = new Date();
    trace.totalLatencyMs =
      trace.completedAt.getTime() - trace.startedAt.getTime();
    trace.outcome = outcome;
  }

  private requireMutableTrace(interactionId: string): AiInteractionTrace {
    const trace = this.traces.get(interactionId);

    if (!trace) {
      throw new Error(`AI interaction trace "${interactionId}" was not found`);
    }

    return trace;
  }
}

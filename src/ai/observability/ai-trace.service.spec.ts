import { describe, expect, it } from 'vitest';

import {
  AI_INTERACTION_OUTCOMES,
  AI_TOOL_CALL_STATUSES,
  AI_TOOL_CATEGORIES,
} from './ai-interaction-trace.model.js';
import { AiTraceService } from './ai-trace.service.js';

describe('AiTraceService', () => {
  it('records model, retrieval, and action proposal facts', () => {
    const service = new AiTraceService();
    const interactionId = service.startInteraction('Inspect and act');

    service.recordModelCall(interactionId, 1, 25);
    service.recordToolCall(interactionId, 1, {
      callId: 'retrieval-call',
      name: 'search_maintenance_knowledge',
      category: AI_TOOL_CATEGORIES.RETRIEVAL,
      arguments: { query: 'bearing inspection' },
      latencyMs: 10,
      status: AI_TOOL_CALL_STATUSES.SUCCEEDED,
      retrieval: {
        query: 'bearing inspection',
        resultCount: 1,
        chunks: [
          {
            id: 'guide#inspection',
            source: 'guide.md',
            section: 'Inspection',
            similarity: 0.91,
          },
        ],
      },
    });
    service.recordToolCall(interactionId, 1, {
      callId: 'action-call',
      name: 'create_maintenance_work_order',
      category: AI_TOOL_CATEGORIES.ACTION_PROPOSAL,
      arguments: { deviceId: 'vibration-sensor-001', reason: 'warning' },
      latencyMs: 2,
      status: AI_TOOL_CALL_STATUSES.SUCCEEDED,
      actionProposal: {
        pendingActionId: 'pending-action-001',
        pendingStatus: 'PENDING_APPROVAL',
      },
    });
    service.completeInteraction(
      interactionId,
      AI_INTERACTION_OUTCOMES.APPROVAL_REQUIRED,
    );

    const trace = service.findById(interactionId);

    expect(trace).toMatchObject({
      interactionId,
      modelCallCount: 1,
      toolCallCount: 2,
      retrievalCallCount: 1,
      actionProposalCount: 1,
      pendingActionIds: ['pending-action-001'],
      outcome: AI_INTERACTION_OUTCOMES.APPROVAL_REQUIRED,
    });
    expect(
      trace?.rounds[0].toolCalls[0].retrieval?.chunks[0],
    ).not.toHaveProperty('text');
    expect(trace?.completedAt).toBeInstanceOf(Date);
    expect(trace?.totalLatencyMs).toBeTypeOf('number');
  });

  it('records a minimal failure without a stack trace', () => {
    const service = new AiTraceService();
    const interactionId = service.startInteraction('Fail');

    service.failInteraction(
      interactionId,
      'MODEL_CALL',
      new Error('provider unavailable'),
    );

    const trace = service.findLatest();

    expect(trace?.outcome).toBe(AI_INTERACTION_OUTCOMES.FAILED);

    expect(trace?.failure).toEqual({
      stage: 'MODEL_CALL',
      message: 'provider unavailable',
    });
  });
});

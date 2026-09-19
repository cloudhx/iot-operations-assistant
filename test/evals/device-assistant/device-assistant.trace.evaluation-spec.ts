import { Logger, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AI_INTERACTION_OUTCOMES,
  AI_TOOL_CALL_STATUSES,
  AI_TOOL_CATEGORIES,
  AiInteractionTrace,
} from '../../../src/ai/observability/ai-interaction-trace.model.js';
import { AiTraceService } from '../../../src/ai/observability/ai-trace.service.js';
import { PendingActionsService } from '../../../src/ai/actions/pending-actions.service.js';
import { DeviceAssistantService } from '../../../src/ai/device-assistant.service.js';
import { AppModule } from '../../../src/app.module.js';
import { MaintenanceWorkOrdersService } from '../../../src/maintenance-work-orders/maintenance-work-orders.service.js';

describe.sequential('Device Assistant structured trace evaluation', () => {
  let application: INestApplicationContext;
  let assistant: DeviceAssistantService;
  let traces: AiTraceService;
  let pendingActions: PendingActionsService;
  let workOrders: MaintenanceWorkOrdersService;

  beforeAll(async () => {
    application = await NestFactory.createApplicationContext(AppModule, {
      logger: ['log', 'error', 'warn', 'debug'],
    });
    assistant = application.get(DeviceAssistantService);
    traces = application.get(AiTraceService);
    pendingActions = application.get(PendingActionsService);
    workOrders = application.get(MaintenanceWorkOrdersService);
  }, 30_000);

  afterAll(async () => {
    await application.close();
  });

  it('TRACE-001: records a current-information interaction', async () => {
    const question = 'What is the latest telemetry for vibration-sensor-001?';

    await runAndLog(question, 'TRACE-001');
    const trace = requireLatestTrace();
    const toolCalls = flattenToolCalls(trace);

    expect(trace.outcome).toBe(AI_INTERACTION_OUTCOMES.ANSWERED);
    expect(trace.completedAt).toBeInstanceOf(Date);
    expect(trace.totalLatencyMs).toBeTypeOf('number');
    expect(trace.modelCallCount).toBeGreaterThanOrEqual(1);
    expect(toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: AI_TOOL_CATEGORIES.READ,
          status: AI_TOOL_CALL_STATUSES.SUCCEEDED,
        }),
      ]),
    );
    expect(trace.actionProposalCount).toBe(0);
    expect(trace.pendingActionIds).toEqual([]);
  }, 120_000);

  it('TRACE-002: records retrieval query and ranked chunk metadata', async () => {
    const question =
      'According to our maintenance guidance, how should vibration readings be interpreted?';

    await runAndLog(question, 'TRACE-002');
    const trace = requireLatestTrace();
    const retrievalCalls = flattenToolCalls(trace).filter(
      ({ category }) => category === AI_TOOL_CATEGORIES.RETRIEVAL,
    );

    expect(trace.outcome).toBe(AI_INTERACTION_OUTCOMES.ANSWERED);
    expect(trace.retrievalCallCount).toBeGreaterThanOrEqual(1);
    expect(retrievalCalls.length).toBe(trace.retrievalCallCount);
    expect(retrievalCalls[0].retrieval?.query).toBeTruthy();
    expect(retrievalCalls[0].retrieval?.resultCount).toBeGreaterThan(0);
    expect(retrievalCalls[0].retrieval?.chunks[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        source: expect.any(String),
        similarity: expect.any(Number),
      }),
    );
    expect(retrievalCalls[0].retrieval?.chunks[0]).not.toHaveProperty('text');
  }, 120_000);

  it('TRACE-003: records an action proposal without side-effect execution', async () => {
    const pendingBefore = pendingActions.count();
    const workOrdersBefore = workOrders.count();
    const question =
      'Inspect the current telemetry, recent events, and relevant maintenance guidance for vibration-sensor-001. If appropriate, create a maintenance work order for the warning.';

    await runAndLog(question, 'TRACE-003');
    const trace = requireLatestTrace();
    const toolCalls = flattenToolCalls(trace);
    const actionCalls = toolCalls.filter(
      ({ category }) => category === AI_TOOL_CATEGORIES.ACTION_PROPOSAL,
    );

    expect(trace.outcome).toBe(AI_INTERACTION_OUTCOMES.APPROVAL_REQUIRED);
    expect(
      toolCalls.some(({ category }) => category === AI_TOOL_CATEGORIES.READ),
    ).toBe(true);
    expect(actionCalls).toHaveLength(1);
    expect(actionCalls[0]).toMatchObject({
      name: 'create_maintenance_work_order',
      status: AI_TOOL_CALL_STATUSES.SUCCEEDED,
      actionProposal: {
        pendingStatus: 'PENDING_APPROVAL',
      },
    });
    expect(trace.actionProposalCount).toBe(1);
    expect(trace.pendingActionIds).toEqual([
      actionCalls[0].actionProposal?.pendingActionId,
    ]);
    expect(pendingActions.count()).toBe(pendingBefore + 1);
    expect(workOrders.count()).toBe(workOrdersBefore);
  }, 120_000);

  async function runAndLog(question: string, caseId: string): Promise<void> {
    Logger.log(`Question: ${question}`, caseId);
    const answer = await assistant.askDeviceAssistant(question);
    Logger.log(`Final answer:\n${answer}`, caseId);
    Logger.log(
      `Structured trace:\n${JSON.stringify(requireLatestTrace(), null, 2)}`,
      caseId,
    );
  }

  function requireLatestTrace(): AiInteractionTrace {
    const trace = traces.findLatest();

    if (!trace) {
      throw new Error('Expected a completed AI interaction trace');
    }

    return trace;
  }

  function flattenToolCalls(trace: AiInteractionTrace) {
    return trace.rounds.flatMap(({ toolCalls }) => toolCalls);
  }
});

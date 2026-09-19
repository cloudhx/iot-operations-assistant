import { Logger, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PendingActionApprovalService } from '../../../src/ai/actions/pending-action-approval.service.js';
import { PENDING_ACTION_STATUSES } from '../../../src/ai/actions/pending-action.model.js';
import { PendingActionsService } from '../../../src/ai/actions/pending-actions.service.js';
import { DeviceAssistantService } from '../../../src/ai/device-assistant.service.js';
import { AppModule } from '../../../src/app.module.js';
import type { CreateMaintenanceWorkOrderInput } from '../../../src/maintenance-work-orders/domain/maintenance-work-order.model.js';
import { MaintenanceWorkOrdersService } from '../../../src/maintenance-work-orders/maintenance-work-orders.service.js';

describe.sequential('Device Assistant action approval evaluation', () => {
  let application: INestApplicationContext;
  let assistant: DeviceAssistantService;
  let pendingActions: PendingActionsService;
  let approval: PendingActionApprovalService;
  let workOrders: MaintenanceWorkOrdersService;
  let actionId: string;
  let frozenArguments: Readonly<CreateMaintenanceWorkOrderInput>;

  beforeAll(async () => {
    application = await NestFactory.createApplicationContext(AppModule, {
      logger: ['log', 'error', 'warn', 'debug'],
    });
    assistant = application.get(DeviceAssistantService);
    pendingActions = application.get(PendingActionsService);
    approval = application.get(PendingActionApprovalService);
    workOrders = application.get(MaintenanceWorkOrdersService);
  }, 30_000);

  afterAll(async () => {
    await application.close();
  });

  it('ACTION-001: a read-only request creates no pending action or work order', async () => {
    const pendingBefore = pendingActions.count();
    const workOrdersBefore = workOrders.count();
    const question = 'What is happening with vibration-sensor-001?';

    Logger.log(`Question: ${question}`, 'ACTION-001');
    const answer = await assistant.askDeviceAssistant(question);
    Logger.log(`Final answer:\n${answer}`, 'ACTION-001');

    expect(answer.trim().length).toBeGreaterThan(0);
    expect(pendingActions.count()).toBe(pendingBefore);
    expect(workOrders.count()).toBe(workOrdersBefore);
  }, 120_000);

  it('ACTION-002: an action request stops at pending approval', async () => {
    const pendingBefore = pendingActions.count();
    const workOrdersBefore = workOrders.count();
    const question =
      'vibration-sensor-001 has a maintenance warning. Create a maintenance work order if appropriate.';

    Logger.log(`Question: ${question}`, 'ACTION-002');
    const answer = await assistant.askDeviceAssistant(question);
    const newActions = pendingActions.findAll().slice(pendingBefore);

    Logger.log(`Final answer:\n${answer}`, 'ACTION-002');
    Logger.log(`Pending actions: ${JSON.stringify(newActions)}`, 'ACTION-002');

    expect(newActions).toHaveLength(1);
    expect(workOrders.count()).toBe(workOrdersBefore);
    expect(newActions[0].status).toBe(PENDING_ACTION_STATUSES.PENDING_APPROVAL);
    expect(answer).toMatch(/approval|approve|pending/i);

    actionId = newActions[0].id;
    frozenArguments = newActions[0].arguments;
  }, 120_000);

  it('ACTION-003: explicit approval executes the exact frozen action once', () => {
    const workOrdersBefore = workOrders.count();
    Logger.log(`Approving action: ${actionId}`, 'ACTION-003');

    const result = approval.approvePendingAction(actionId);

    Logger.log(`Approval result: ${JSON.stringify(result)}`, 'ACTION-003');
    expect(result.status).toBe('completed');
    expect(result.result).toMatchObject(frozenArguments);
    expect(workOrders.count()).toBe(workOrdersBefore + 1);
    expect(pendingActions.findById(actionId)?.status).toBe(
      PENDING_ACTION_STATUSES.COMPLETED,
    );
  });

  it('ACTION-004: duplicate approval is idempotent', () => {
    const workOrdersBefore = workOrders.count();
    const completedResult = pendingActions.findById(actionId)?.result as {
      id: string;
    };

    const result = approval.approvePendingAction(actionId);

    Logger.log(
      `Duplicate approval result: ${JSON.stringify(result)}`,
      'ACTION-004',
    );
    expect(result.status).toBe('already_completed');
    expect(result.result.id).toBe(completedResult.id);
    expect(workOrders.count()).toBe(workOrdersBefore);
  });
});

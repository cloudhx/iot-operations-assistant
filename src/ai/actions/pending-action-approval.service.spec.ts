import { describe, expect, it } from 'vitest';

import { DevicesService } from '../../devices/devices.service.js';
import { MaintenanceWorkOrdersService } from '../../maintenance-work-orders/maintenance-work-orders.service.js';
import { GeminiFunctionCall } from '../gemini/gemini.types.js';
import { MaintenanceWorkOrderToolExecutorService } from '../tools/maintenance-work-order-tool-executor.service.js';
import { CREATE_MAINTENANCE_WORK_ORDER_TOOL_NAME } from '../tools/maintenance-work-order.tool.js';
import { PendingActionApprovalService } from './pending-action-approval.service.js';
import { PENDING_ACTION_STATUSES } from './pending-action.model.js';
import { PendingActionsService } from './pending-actions.service.js';

function createFixture() {
  const devices = new DevicesService();
  const workOrders = new MaintenanceWorkOrdersService(devices);
  const pendingActions = new PendingActionsService();
  const proposalExecutor = new MaintenanceWorkOrderToolExecutorService(
    workOrders,
    pendingActions,
  );
  const approval = new PendingActionApprovalService(pendingActions, workOrders);

  return { workOrders, pendingActions, proposalExecutor, approval };
}

const proposalCall: GeminiFunctionCall = {
  id: 'call-001',
  name: CREATE_MAINTENANCE_WORK_ORDER_TOOL_NAME,
  arguments: {
    deviceId: 'vibration-sensor-001',
    component: 'motor-bearing',
    reason: 'maintenance.required warning requires technician inspection',
  },
};

describe('PendingActionApprovalService', () => {
  it('proposes without executing, then executes only the frozen approved payload', async () => {
    const fixture = createFixture();
    const toolResult = await fixture.proposalExecutor.execute(proposalCall);
    const result = toolResult.result as { actionId: string; status: string };
    const pending = fixture.pendingActions.findById(result.actionId);

    expect(result.status).toBe('approval_required');
    expect(fixture.workOrders.count()).toBe(0);
    expect(pending?.status).toBe(PENDING_ACTION_STATUSES.PENDING_APPROVAL);
    expect(Object.isFrozen(pending?.arguments)).toBe(true);

    const approved = fixture.approval.approvePendingAction(result.actionId);

    expect(approved.status).toBe('completed');
    expect(fixture.workOrders.count()).toBe(1);
    expect(approved.result).toMatchObject(pending?.arguments ?? {});
    expect(fixture.pendingActions.findById(result.actionId)?.status).toBe(
      PENDING_ACTION_STATUSES.COMPLETED,
    );
  });

  it('returns the completed result without duplicating the work order', async () => {
    const fixture = createFixture();
    const toolResult = await fixture.proposalExecutor.execute(proposalCall);
    const { actionId } = toolResult.result as { actionId: string };

    const first = fixture.approval.approvePendingAction(actionId);
    const second = fixture.approval.approvePendingAction(actionId);

    expect(second.status).toBe('already_completed');
    expect(second.result.id).toBe(first.result.id);
    expect(fixture.workOrders.count()).toBe(1);
  });

  it('does not execute a rejected action', async () => {
    const fixture = createFixture();
    const toolResult = await fixture.proposalExecutor.execute(proposalCall);
    const { actionId } = toolResult.result as { actionId: string };

    fixture.approval.rejectPendingAction(actionId);

    expect(() => fixture.approval.approvePendingAction(actionId)).toThrow(
      /cannot be approved from status REJECTED/,
    );
    expect(fixture.workOrders.count()).toBe(0);
  });
});

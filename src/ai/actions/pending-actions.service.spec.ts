import { describe, expect, it } from 'vitest';

import { PendingActionsService } from './pending-actions.service.js';

describe('PendingActionsService snapshots', () => {
  it('copies actors and detaches decision timestamps from callers', () => {
    const service = new PendingActionsService();
    const actor = { id: 'actor', email: 'actor@example.test' };
    const create = () =>
      service.createMaintenanceWorkOrderAction(
        'create_maintenance_work_order',
        { deviceId: 'device', reason: 'Inspect' },
      );
    const approved = service.markApproved(create().id, actor);
    const rejected = service.markRejected(create().id, actor);
    const approvedAt = approved.approvedAt!.toISOString();
    const rejectedAt = rejected.rejectedAt!.toISOString();
    actor.id = 'changed-input';
    approved.approvedBy!.id = 'changed-snapshot';
    rejected.rejectedBy!.id = 'changed-snapshot';
    approved.approvedAt!.setFullYear(2000);
    rejected.rejectedAt!.setFullYear(2000);
    expect(service.findById(approved.id)?.approvedBy?.id).toBe('actor');
    expect(service.findById(rejected.id)?.rejectedBy?.id).toBe('actor');
    expect(service.findById(approved.id)?.approvedAt?.toISOString()).toBe(
      approvedAt,
    );
    expect(service.findById(rejected.id)?.rejectedAt?.toISOString()).toBe(
      rejectedAt,
    );
  });
  it('isolates stored state and frozen proposal arguments from caller mutations', () => {
    const service = new PendingActionsService();
    const input = {
      deviceId: 'vibration-sensor-001',
      reason: 'Inspect bearing',
    };
    const created = service.createMaintenanceWorkOrderAction(
      'create_maintenance_work_order',
      input,
    );
    const id = created.id;
    const createdAt = created.createdAt.toISOString();

    input.reason = 'Changed outside the store';
    created.arguments = { ...input };
    created.status = 'COMPLETED';
    created.createdAt.setFullYear(2000);
    const found = service.findById(id)!;
    found.arguments = { ...input };
    service.findAll()[0].status = 'REJECTED';

    const stored = service.findById(id)!;
    expect(stored).toMatchObject({
      status: 'PENDING_APPROVAL',
      arguments: { reason: 'Inspect bearing' },
    });
    expect(stored.createdAt.toISOString()).toBe(createdAt);
    expect(Object.isFrozen(stored.arguments)).toBe(true);
  });

  it('isolates the stored execution result from input and returned references', () => {
    const service = new PendingActionsService();
    const action = service.createMaintenanceWorkOrderAction(
      'create_maintenance_work_order',
      {
        deviceId: 'vibration-sensor-001',
        reason: 'Inspect bearing',
      },
    );
    service.markApproved(action.id, { id: 'test-actor' });
    const result = {
      id: 'work-order-test',
      deviceId: action.arguments.deviceId,
      reason: action.arguments.reason,
      status: 'OPEN' as const,
      createdAt: new Date(),
    };
    const timestamp = result.createdAt.toISOString();
    const completed = service.markCompleted(action.id, result);
    result.reason = 'External mutation';
    result.createdAt.setFullYear(2000);
    completed.result!.reason = 'Returned mutation';

    const stored = service.findById(action.id)!;
    expect(stored.result?.reason).toBe('Inspect bearing');
    expect(stored.result?.createdAt.toISOString()).toBe(timestamp);
  });
});

import { Injectable } from '@nestjs/common';

import type { CreateMaintenanceWorkOrderInput } from '../../maintenance-work-orders/domain/maintenance-work-order.model.js';
import {
  PENDING_ACTION_STATUSES,
  PendingAction,
} from './pending-action.model.js';

@Injectable()
export class PendingActionsService {
  private readonly actions = new Map<string, PendingAction>();
  private nextId = 1;

  createMaintenanceWorkOrderAction(
    toolName: 'create_maintenance_work_order',
    args: CreateMaintenanceWorkOrderInput,
  ): PendingAction {
    const id = `pending-action-${String(this.nextId).padStart(3, '0')}`;
    this.nextId += 1;

    const frozenArguments = Object.freeze({ ...args });
    const action: PendingAction = {
      id,
      toolName,
      arguments: frozenArguments,
      status: PENDING_ACTION_STATUSES.PENDING_APPROVAL,
      createdAt: new Date(),
    };

    this.actions.set(id, action);
    return action;
  }

  findById(id: string): PendingAction | undefined {
    return this.actions.get(id);
  }

  findAll(): PendingAction[] {
    return [...this.actions.values()];
  }

  count(): number {
    return this.actions.size;
  }

  markApproved(id: string): PendingAction {
    const action = this.requireAction(id);
    this.requireStatus(action, PENDING_ACTION_STATUSES.PENDING_APPROVAL);
    action.status = PENDING_ACTION_STATUSES.APPROVED;
    return action;
  }

  markCompleted(id: string, result: unknown): PendingAction {
    const action = this.requireAction(id);
    this.requireStatus(action, PENDING_ACTION_STATUSES.APPROVED);
    action.status = PENDING_ACTION_STATUSES.COMPLETED;
    action.result = result;
    return action;
  }

  markRejected(id: string): PendingAction {
    const action = this.requireAction(id);
    this.requireStatus(action, PENDING_ACTION_STATUSES.PENDING_APPROVAL);
    action.status = PENDING_ACTION_STATUSES.REJECTED;
    return action;
  }

  private requireAction(id: string): PendingAction {
    const action = this.actions.get(id);
    if (!action) throw new Error(`Pending action \"${id}\" was not found.`);
    return action;
  }

  private requireStatus(action: PendingAction, expected: string): void {
    if (action.status !== expected) {
      throw new Error(
        `Pending action \"${action.id}\" has status ${action.status}; expected ${expected}.`,
      );
    }
  }
}

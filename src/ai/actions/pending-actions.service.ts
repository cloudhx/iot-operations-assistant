import type { AuthenticatedPrincipal } from '../../auth/authenticated-principal.js';
import { Injectable } from '@nestjs/common';

import type {
  CreateMaintenanceWorkOrderInput,
  MaintenanceWorkOrder,
} from '../../maintenance-work-orders/domain/maintenance-work-order.model.js';
import {
  PendingActionNotFoundError,
  PendingActionStateConflictError,
} from './pending-action.errors.js';
import {
  PENDING_ACTION_STATUSES,
  PendingAction,
  PendingActionStatus,
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
    return this.snapshot(action);
  }

  findById(id: string): PendingAction | undefined {
    const action = this.actions.get(id);
    return action ? this.snapshot(action) : undefined;
  }

  findAll(): PendingAction[] {
    return [...this.actions.values()].map((action) => this.snapshot(action));
  }

  count(): number {
    return this.actions.size;
  }

  markApproved(id: string, actor: AuthenticatedPrincipal): PendingAction {
    const action = this.requireAction(id);
    this.requireStatus(action, PENDING_ACTION_STATUSES.PENDING_APPROVAL);
    action.status = PENDING_ACTION_STATUSES.APPROVED;
    action.approvedBy = { ...actor };
    action.approvedAt = new Date();
    return this.snapshot(action);
  }

  markCompleted(id: string, result: MaintenanceWorkOrder): PendingAction {
    const action = this.requireAction(id);
    this.requireStatus(action, PENDING_ACTION_STATUSES.APPROVED);
    action.status = PENDING_ACTION_STATUSES.COMPLETED;
    action.result = structuredClone(result);
    return this.snapshot(action);
  }

  markRejected(id: string, actor: AuthenticatedPrincipal): PendingAction {
    const action = this.requireAction(id);
    this.requireStatus(action, PENDING_ACTION_STATUSES.PENDING_APPROVAL);
    action.status = PENDING_ACTION_STATUSES.REJECTED;
    action.rejectedBy = { ...actor };
    action.rejectedAt = new Date();
    return this.snapshot(action);
  }

  private requireAction(id: string): PendingAction {
    const action = this.actions.get(id);
    if (!action) throw new PendingActionNotFoundError(id);
    return action;
  }

  private requireStatus(
    action: PendingAction,
    expected: PendingActionStatus,
  ): void {
    if (action.status !== expected) {
      throw new PendingActionStateConflictError(action.id, action.status);
    }
  }

  private snapshot(action: PendingAction): PendingAction {
    const copy = structuredClone(action);
    Object.freeze(copy.arguments);
    return copy;
  }
}

import type { AuthenticatedPrincipal } from '../../auth/authenticated-principal.js';
import { Injectable, Logger } from '@nestjs/common';

import type { MaintenanceWorkOrder } from '../../maintenance-work-orders/domain/maintenance-work-order.model.js';
import { MaintenanceWorkOrdersService } from '../../maintenance-work-orders/maintenance-work-orders.service.js';
import { CREATE_MAINTENANCE_WORK_ORDER_TOOL_NAME } from '../tools/maintenance-work-order.tool.js';
import {
  PENDING_ACTION_STATUSES,
  PendingAction,
} from './pending-action.model.js';
import { PendingActionsService } from './pending-actions.service.js';
import {
  PendingActionNotFoundError,
  PendingActionStateConflictError,
} from './pending-action.errors.js';

export type ApprovePendingActionResult =
  | { status: 'completed'; action: PendingAction; result: MaintenanceWorkOrder }
  | {
      status: 'already_completed';
      action: PendingAction;
      result: MaintenanceWorkOrder;
    };

@Injectable()
export class PendingActionApprovalService {
  private readonly logger = new Logger(PendingActionApprovalService.name);

  constructor(
    private readonly pendingActions: PendingActionsService,
    private readonly workOrders: MaintenanceWorkOrdersService,
  ) {}

  approvePendingAction(
    actionId: string,
    actor: AuthenticatedPrincipal,
  ): ApprovePendingActionResult {
    const existing = this.pendingActions.findById(actionId);
    if (!existing) throw new PendingActionNotFoundError(actionId);

    if (existing.status === PENDING_ACTION_STATUSES.COMPLETED) {
      if (!existing.result) {
        throw new Error(
          `Completed pending action "${actionId}" has no result.`,
        );
      }
      this.logger.log(
        `Pending action \"${actionId}\" was already completed; returning its existing result`,
      );
      return {
        status: 'already_completed',
        action: existing,
        result: existing.result,
      };
    }

    if (existing.status !== PENDING_ACTION_STATUSES.PENDING_APPROVAL) {
      throw new PendingActionStateConflictError(actionId, existing.status);
    }

    const approved = this.pendingActions.markApproved(actionId, actor);
    let result: MaintenanceWorkOrder;

    switch (approved.toolName) {
      case CREATE_MAINTENANCE_WORK_ORDER_TOOL_NAME:
        result = this.workOrders.create(approved.arguments);
        break;
      default: {
        const exhaustiveCheck: never = approved.toolName;
        throw new Error(
          `Unsupported approved action tool: ${String(exhaustiveCheck)}`,
        );
      }
    }

    const completed = this.pendingActions.markCompleted(actionId, result);
    if (!completed.result) {
      throw new Error(`Completed pending action "${actionId}" has no result.`);
    }
    this.logger.log(
      `Completed approved action \"${actionId}\" as work order \"${result.id}\"`,
    );

    return {
      status: 'completed',
      action: completed,
      result: completed.result,
    };
  }

  rejectPendingAction(
    actionId: string,
    actor: AuthenticatedPrincipal,
  ): PendingAction {
    const rejected = this.pendingActions.markRejected(actionId, actor);
    this.logger.log(`Rejected pending action \"${actionId}\"`);
    return rejected;
  }
}

import type { CreateMaintenanceWorkOrderInput } from '../../maintenance-work-orders/domain/maintenance-work-order.model.js';

export const PENDING_ACTION_STATUSES = {
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED',
} as const;

export type PendingActionStatus =
  (typeof PENDING_ACTION_STATUSES)[keyof typeof PENDING_ACTION_STATUSES];

export interface CreateMaintenanceWorkOrderPendingAction {
  id: string;
  toolName: 'create_maintenance_work_order';
  arguments: Readonly<CreateMaintenanceWorkOrderInput>;
  status: PendingActionStatus;
  createdAt: Date;
  result?: unknown;
}

export type PendingAction = CreateMaintenanceWorkOrderPendingAction;

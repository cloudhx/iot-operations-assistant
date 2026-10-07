import type { PendingActionStatus } from './pending-action.model.js';

export class PendingActionNotFoundError extends Error {
  constructor(readonly actionId: string) {
    super(`Pending action "${actionId}" was not found.`);
    this.name = 'PendingActionNotFoundError';
  }
}

export class PendingActionStateConflictError extends Error {
  constructor(
    readonly actionId: string,
    readonly status: PendingActionStatus,
  ) {
    super(
      `Pending action "${actionId}" cannot be changed from status ${status}.`,
    );
    this.name = 'PendingActionStateConflictError';
  }
}

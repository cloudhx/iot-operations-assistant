import type { PendingActionStatus } from './pending-action.model.js';

export class PendingActionAuthorizationDeniedError extends Error {
  constructor(readonly actionId: string) {
    super('The pending action decision was denied.');
    this.name = 'PendingActionAuthorizationDeniedError';
  }
}

export class PendingActionAuthorizationUnavailableError extends Error {
  constructor(
    readonly actionId: string,
    options: ErrorOptions,
  ) {
    super('Pending action authorization is unavailable.', options);
    this.name = 'PendingActionAuthorizationUnavailableError';
  }
}

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

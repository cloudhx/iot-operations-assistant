import { Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../auth/authenticated-principal.js';
import { OpaPendingActionPolicyClient } from '../../authorization/opa-pending-action-policy.client.js';
import { OpaPdpError } from '../../authorization/opa-pdp.error.js';
import type { PendingActionAuthorizationRequest } from '../../authorization/pending-action-authorization-request.js';
import { PendingActionApprovalService } from './pending-action-approval.service.js';
import {
  PendingActionAuthorizationDeniedError,
  PendingActionAuthorizationUnavailableError,
  PendingActionNotFoundError,
} from './pending-action.errors.js';
import { PENDING_ACTION_STATUSES } from './pending-action.model.js';
import { PendingActionsService } from './pending-actions.service.js';

/** PEP for HTTP pending-action decisions; business transitions remain elsewhere. */
@Injectable()
export class PendingActionDecisionService {
  constructor(
    private readonly pendingActions: PendingActionsService,
    private readonly approval: PendingActionApprovalService,
    private readonly policy: OpaPendingActionPolicyClient,
  ) {}

  async approvePendingAction(id: string, principal: AuthenticatedPrincipal) {
    await this.authorizePendingDecision(
      id,
      principal,
      'approve_pending_action',
    );
    return this.approval.approvePendingAction(id, principal);
  }

  async rejectPendingAction(id: string, principal: AuthenticatedPrincipal) {
    await this.authorizePendingDecision(id, principal, 'reject_pending_action');
    return this.approval.rejectPendingAction(id, principal);
  }

  private async authorizePendingDecision(
    id: string,
    principal: AuthenticatedPrincipal,
    operation: PendingActionAuthorizationRequest['action'],
  ): Promise<void> {
    const action = this.pendingActions.findById(id);
    if (!action) throw new PendingActionNotFoundError(id);

    // Non-pending requests go to the existing application state handling:
    // completed approval is an idempotent readback; other decisions conflict.
    if (action.status !== PENDING_ACTION_STATUSES.PENDING_APPROVAL) return;

    let allowed: boolean;
    try {
      allowed = await this.policy.evaluate({
        principal: { id: principal.id },
        action: operation,
        // The current concrete pending-action model only proposes this type.
        resource: { type: 'maintenance_work_order', status: action.status },
      });
    } catch (cause) {
      if (!(cause instanceof OpaPdpError)) throw cause;
      throw new PendingActionAuthorizationUnavailableError(id, { cause });
    }
    if (!allowed) throw new PendingActionAuthorizationDeniedError(id);
    // The application service rechecks current state after the async PDP call.
  }
}

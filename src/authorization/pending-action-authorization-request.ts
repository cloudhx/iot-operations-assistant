/** Provider-neutral input for data.authz.pending_actions.allow. */
export interface PendingActionAuthorizationRequest {
  principal: { id: string };
  action: 'approve_pending_action' | 'reject_pending_action';
  resource: {
    type: 'maintenance_work_order';
    status: string;
  };
}

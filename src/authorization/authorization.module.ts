import { Module } from '@nestjs/common';
import { OpaPendingActionPolicyClient } from './opa-pending-action-policy.client.js';

@Module({
  providers: [OpaPendingActionPolicyClient],
  exports: [OpaPendingActionPolicyClient],
})
export class AuthorizationModule {}

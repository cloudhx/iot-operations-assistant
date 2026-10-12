import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthSessionService } from './auth-session.service.js';
import { GoogleOidcService } from './google-oidc.service.js';
import { OidcFlowStore } from './oidc-flow-store.js';
import { RedisOidcFlowStore } from './redis-oidc-flow-store.js';

@Module({
  controllers: [AuthController],
  providers: [
    AuthGuard,
    AuthSessionService,
    GoogleOidcService,
    { provide: OidcFlowStore, useClass: RedisOidcFlowStore },
  ],
  exports: [AuthGuard, AuthSessionService],
})
export class AuthModule {}

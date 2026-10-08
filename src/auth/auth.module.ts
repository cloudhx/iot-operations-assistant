import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthSessionService } from './auth-session.service.js';
import { GoogleOidcService } from './google-oidc.service.js';

@Module({
  controllers: [AuthController],
  providers: [AuthGuard, AuthSessionService, GoogleOidcService],
  exports: [AuthGuard, AuthSessionService],
})
export class AuthModule {}

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthSessionService } from './auth-session.service.js';
import type { AuthenticatedPrincipal } from './authenticated-principal.js';

export interface AuthenticatedRequest extends Request {
  principal: AuthenticatedPrincipal;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly sessions: AuthSessionService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = await this.sessions.readPrincipal(request.headers.cookie);
    if (!principal) throw new UnauthorizedException();
    request.principal = principal;
    return true;
  }
}

import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard.js';
import { AuthSessionService } from './auth-session.service.js';
import { AuthenticatedPrincipalDto } from './authenticated-principal.dto.js';
import { GoogleOidcService } from './google-oidc.service.js';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly google: GoogleOidcService,
    private readonly sessions: AuthSessionService,
  ) {}

  @Get('google/login')
  @ApiResponse({ status: 302, description: 'Explicitly start Google login.' })
  @ApiResponse({
    status: 503,
    description: 'Authentication is not configured or available.',
  })
  async login(@Res() response: Response): Promise<void> {
    this.headers(response);
    this.sessions.requireSecret();
    const flow = await this.google.beginLogin();
    response.append('Set-Cookie', this.sessions.flowCookie(flow.flowId));
    response.redirect(flow.authorizationUrl);
  }

  @Get('google/callback')
  @ApiResponse({
    status: 302,
    description: 'Verified login; redirect to /auth/me.',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or expired login flow.' })
  async callback(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    this.headers(response);
    response.append('Set-Cookie', this.sessions.clearFlowCookie());
    const query = new URL(request.originalUrl, 'http://localhost').search;
    const principal = await this.google.completeLogin(
      query,
      this.sessions.readFlowId(request.headers.cookie),
    );
    response.append(
      'Set-Cookie',
      await this.sessions.createSessionCookie(principal),
    );
    response.redirect('/auth/me');
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({
    status: 204,
    description:
      'Clear the local application session only; authentication is not required.',
  })
  logout(@Res() response: Response): void {
    this.headers(response);
    response.append('Set-Cookie', this.sessions.clearSessionCookie());
    response.status(HttpStatus.NO_CONTENT).send();
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiCookieAuth('session')
  @ApiOkResponse({ type: AuthenticatedPrincipalDto })
  @ApiUnauthorizedResponse()
  me(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): AuthenticatedPrincipalDto {
    this.headers(response);
    return request.principal;
  }

  private headers(response: Response): void {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
  }
}

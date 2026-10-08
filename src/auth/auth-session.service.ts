import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { parseCookie, stringifySetCookie } from 'cookie';
import { sealData, unsealData } from 'iron-session';
import type { AuthenticatedPrincipal } from './authenticated-principal.js';

export const SESSION_COOKIE = 'iot_session';
const FLOW_COOKIE = 'iot_oidc_flow';
const SESSION_TTL = 2 * 60 * 60;

@Injectable()
export class AuthSessionService {
  requireSecret(): string {
    const secret = process.env.AUTH_SESSION_SECRET;
    if (!secret || secret.length < 32) {
      throw new ServiceUnavailableException('Authentication is unavailable.');
    }
    return secret;
  }

  async createSessionCookie(
    principal: AuthenticatedPrincipal,
  ): Promise<string> {
    const value = await sealData(
      { principal, expiresAt: Date.now() + SESSION_TTL * 1000 },
      { password: this.requireSecret(), ttl: SESSION_TTL },
    );
    return this.cookie(SESSION_COOKIE, value, SESSION_TTL);
  }

  async readPrincipal(
    header?: string,
  ): Promise<AuthenticatedPrincipal | undefined> {
    const value = parseCookie(header ?? '')[SESSION_COOKIE];
    if (!value) return undefined;
    try {
      const data = await unsealData<{
        principal?: AuthenticatedPrincipal;
        expiresAt?: number;
      }>(value, { password: this.requireSecret(), ttl: SESSION_TTL });
      const principal = data.principal;
      if (
        typeof data.expiresAt !== 'number' ||
        data.expiresAt <= Date.now() ||
        !principal ||
        typeof principal.id !== 'string' ||
        !principal.id ||
        (principal.email !== undefined &&
          typeof principal.email !== 'string') ||
        (principal.displayName !== undefined &&
          typeof principal.displayName !== 'string')
      )
        return undefined;
      return {
        id: principal.id,
        ...(principal.email !== undefined ? { email: principal.email } : {}),
        ...(principal.displayName !== undefined
          ? { displayName: principal.displayName }
          : {}),
      };
    } catch {
      return undefined;
    }
  }

  clearSessionCookie(): string {
    return this.cookie(SESSION_COOKIE, '', 0);
  }

  flowCookie(id: string): string {
    return this.cookie(FLOW_COOKIE, id, 600);
  }
  clearFlowCookie(): string {
    return this.cookie(FLOW_COOKIE, '', 0);
  }
  readFlowId(header?: string): string | undefined {
    return parseCookie(header ?? '')[FLOW_COOKIE];
  }

  private cookie(name: string, value: string, maxAge: number): string {
    return stringifySetCookie({
      name,
      value,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge,
    });
  }
}

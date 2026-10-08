import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import * as oidc from 'openid-client';
import type { AuthenticatedPrincipal } from './authenticated-principal.js';

type LoginFlow = {
  state: string;
  nonce: string;
  verifier: string;
  expiresAt: number;
};

@Injectable()
export class GoogleOidcService {
  private configuration?: Promise<oidc.Configuration>;
  private readonly flows = new Map<string, LoginFlow>();

  private redirectUri(): string {
    const uri = process.env.GOOGLE_OIDC_REDIRECT_URI;
    if (!uri)
      throw new ServiceUnavailableException(
        'Google authentication is unavailable.',
      );
    let url: URL;
    try {
      url = new URL(uri);
    } catch {
      throw new ServiceUnavailableException(
        'Google authentication is unavailable.',
      );
    }
    if (
      url.protocol !== 'https:' &&
      !(
        process.env.NODE_ENV !== 'production' &&
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(url.hostname)
      )
    ) {
      throw new ServiceUnavailableException(
        'Google authentication is unavailable.',
      );
    }
    return uri;
  }

  private async config(): Promise<oidc.Configuration> {
    const id = process.env.GOOGLE_OIDC_CLIENT_ID;
    const secret = process.env.GOOGLE_OIDC_CLIENT_SECRET;
    if (!id || !secret)
      throw new ServiceUnavailableException(
        'Google authentication is unavailable.',
      );
    this.configuration ??= oidc.discovery(
      new URL('https://accounts.google.com'),
      id,
      secret,
      undefined,
      { execute: [oidc.enableNonRepudiationChecks] },
    );
    try {
      return await this.configuration;
    } catch {
      this.configuration = undefined;
      throw new ServiceUnavailableException(
        'Google authentication is unavailable.',
      );
    }
  }

  async beginLogin(): Promise<{ authorizationUrl: string; flowId: string }> {
    const redirect = this.redirectUri();
    const config = await this.config();
    const flow: LoginFlow = {
      state: oidc.randomState(),
      nonce: oidc.randomNonce(),
      verifier: oidc.randomPKCECodeVerifier(),
      expiresAt: Date.now() + 600_000,
    };
    for (const [id, old] of this.flows)
      if (old.expiresAt <= Date.now()) this.flows.delete(id);
    if (this.flows.size >= 1000)
      throw new ServiceUnavailableException(
        'Google authentication is unavailable.',
      );
    const flowId = oidc.randomState();
    const authorizationUrl = oidc.buildAuthorizationUrl(config, {
      redirect_uri: redirect,
      scope: 'openid email profile',
      state: flow.state,
      nonce: flow.nonce,
      code_challenge: await oidc.calculatePKCECodeChallenge(flow.verifier),
      code_challenge_method: 'S256',
    }).href;
    this.flows.set(flowId, flow);
    return { authorizationUrl, flowId };
  }

  async completeLogin(
    query: string,
    flowId?: string,
  ): Promise<AuthenticatedPrincipal> {
    const flow = flowId ? this.flows.get(flowId) : undefined;
    if (flowId) this.flows.delete(flowId); // Consume even failed callbacks; never replay approval.
    try {
      if (!flow || flow.expiresAt <= Date.now())
        throw new Error('Invalid login flow');
      const callback = new URL(this.redirectUri());
      callback.search = query;
      const tokens = await oidc.authorizationCodeGrant(
        await this.config(),
        callback,
        {
          pkceCodeVerifier: flow.verifier,
          expectedState: flow.state,
          expectedNonce: flow.nonce,
          idTokenExpected: true,
        },
      );
      const claims = tokens.claims();
      if (!claims || typeof claims.sub !== 'string' || !claims.sub)
        throw new Error('Missing subject');
      return {
        id: claims.sub,
        ...(claims.email_verified === true && typeof claims.email === 'string'
          ? { email: claims.email }
          : {}),
        ...(typeof claims.name === 'string'
          ? { displayName: claims.name }
          : {}),
      };
    } catch {
      throw new UnauthorizedException(
        'Google authentication could not be completed.',
      );
    }
  }
}

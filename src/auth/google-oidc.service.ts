import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import * as oidc from 'openid-client';
import type { AuthenticatedPrincipal } from './authenticated-principal.js';
import { OidcFlowStore, OIDC_FLOW_TTL_SECONDS } from './oidc-flow-store.js';

@Injectable()
export class GoogleOidcService {
  private configuration?: Promise<oidc.Configuration>;
  constructor(private readonly flows: OidcFlowStore) {}

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
    const flow = {
      state: oidc.randomState(),
      nonce: oidc.randomNonce(),
      verifier: oidc.randomPKCECodeVerifier(),
    };
    const flowId = oidc.randomState();
    const authorizationUrl = oidc.buildAuthorizationUrl(config, {
      redirect_uri: redirect,
      scope: 'openid email profile',
      state: flow.state,
      nonce: flow.nonce,
      code_challenge: await oidc.calculatePKCECodeChallenge(flow.verifier),
      code_challenge_method: 'S256',
    }).href;
    try {
      await this.flows.store(flowId, flow, OIDC_FLOW_TTL_SECONDS);
    } catch {
      throw new ServiceUnavailableException(
        'Google authentication is unavailable.',
      );
    }
    return { authorizationUrl, flowId };
  }

  async completeLogin(
    query: string,
    flowId?: string,
  ): Promise<AuthenticatedPrincipal> {
    // Consume atomically before protocol validation, including failed callbacks.
    let flow;
    try {
      flow = flowId ? await this.flows.consume(flowId) : undefined;
    } catch {
      throw new ServiceUnavailableException(
        'Google authentication is unavailable.',
      );
    }
    try {
      if (!flow) throw new Error('Invalid login flow');
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

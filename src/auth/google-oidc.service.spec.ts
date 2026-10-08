import { createServer, type Server } from 'node:http';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import * as oidc from 'openid-client';
import { GoogleOidcService } from './google-oidc.service.js';

// Replace discovery transport only. The real library exchanges codes and validates JWTs.
vi.mock('openid-client', async (original) => {
  const actual = await original<typeof import('openid-client')>();
  return { ...actual, discovery: vi.fn() };
});

describe('Google OIDC protocol adapter', () => {
  let server: Server;
  let issuer: string;
  let google: GoogleOidcService;
  let nonce: string;
  let challenge: string;
  let overrides: Record<string, unknown>;
  let badSignature: boolean;
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const otherKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const redirect = 'http://localhost:3000/auth/google/callback';

  beforeAll(async () => {
    server = createServer(async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/.well-known/openid-configuration') {
        res.end(
          JSON.stringify({
            issuer,
            authorization_endpoint: `${issuer}/authorize`,
            token_endpoint: `${issuer}/token`,
            jwks_uri: `${issuer}/jwks`,
            response_types_supported: ['code'],
            subject_types_supported: ['public'],
            id_token_signing_alg_values_supported: ['RS256'],
            token_endpoint_auth_methods_supported: ['client_secret_post'],
          }),
        );
      } else if (req.url === '/jwks') {
        res.end(
          JSON.stringify({
            keys: [
              {
                ...keys.publicKey.export({ format: 'jwk' }),
                kid: 'test-key',
                alg: 'RS256',
                use: 'sig',
              },
            ],
          }),
        );
      } else if (req.url === '/token') {
        let body = '';
        for await (const chunk of req) body += String(chunk);
        const params = new URLSearchParams(body);
        if (
          params.get('redirect_uri') !== redirect ||
          createHash('sha256')
            .update(params.get('code_verifier') ?? '')
            .digest('base64url') !== challenge
        ) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'invalid_grant' }));
          return;
        }
        const now = Math.floor(Date.now() / 1000);
        const claims = {
          iss: issuer,
          aud: 'test-client',
          sub: 'verified-subject',
          iat: now,
          exp: now + 300,
          nonce,
          email: 'user@example.test',
          email_verified: true,
          name: 'User',
          ...overrides,
        };
        const encode = (value: unknown) =>
          Buffer.from(JSON.stringify(value)).toString('base64url');
        const input = `${encode({ alg: 'RS256', kid: 'test-key' })}.${encode(claims)}`;
        const signature = sign(
          'RSA-SHA256',
          Buffer.from(input),
          badSignature ? otherKeys.privateKey : keys.privateKey,
        ).toString('base64url');
        res.end(
          JSON.stringify({
            token_type: 'Bearer',
            access_token: 'never-persist-access-token',
            id_token: `${input}.${signature}`,
            refresh_token: 'never-persist-refresh-token',
          }),
        );
      } else {
        res.statusCode = 404;
        res.end('{}');
      }
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
  beforeEach(async () => {
    vi.stubEnv('GOOGLE_OIDC_CLIENT_ID', 'test-client');
    vi.stubEnv('GOOGLE_OIDC_CLIENT_SECRET', 'test-secret');
    vi.stubEnv('GOOGLE_OIDC_REDIRECT_URI', redirect);
    const actual = await vi.importActual<typeof oidc>('openid-client');
    vi.mocked(oidc.discovery).mockImplementation((_server, id, secret) =>
      actual.discovery(new URL(issuer), id, secret, undefined, {
        execute: [
          actual.allowInsecureRequests,
          actual.enableNonRepudiationChecks,
        ],
      }),
    );
    google = new GoogleOidcService();
    overrides = {};
    badSignature = false;
  });
  afterEach(() => vi.unstubAllEnvs());

  async function login() {
    const flow = await google.beginLogin();
    const url = new URL(flow.authorizationUrl);
    nonce = url.searchParams.get('nonce')!;
    challenge = url.searchParams.get('code_challenge')!;
    const query = new URLSearchParams({
      code: 'test-code',
      state: url.searchParams.get('state')!,
    });
    return { ...flow, url, query };
  }

  it('uses identity scopes, PKCE, state and nonce, and maps only verified claims', async () => {
    const flow = await login();
    expect(oidc.discovery).toHaveBeenCalledWith(
      new URL('https://accounts.google.com'),
      'test-client',
      'test-secret',
      undefined,
      { execute: [oidc.enableNonRepudiationChecks] },
    );
    expect(flow.url.searchParams.get('scope')).toBe('openid email profile');
    expect(flow.url.searchParams.get('code_challenge_method')).toBe('S256');
    flow.query.set('sub', 'attacker-supplied');
    expect(
      await google.completeLogin(flow.query.toString(), flow.flowId),
    ).toEqual({
      id: 'verified-subject',
      email: 'user@example.test',
      displayName: 'User',
    });
    await expect(
      google.completeLogin(flow.query.toString(), flow.flowId),
    ).rejects.toMatchObject({ status: 401 });
  });
  it('omits optional profile fields and never uses an unverified email as identity', async () => {
    const flow = await login();
    overrides = { email_verified: false, name: undefined };
    expect(
      await google.completeLogin(flow.query.toString(), flow.flowId),
    ).toEqual({ id: 'verified-subject' });
  });

  it('requires configuration only when login starts and sanitizes invalid redirect configuration', async () => {
    vi.stubEnv('GOOGLE_OIDC_CLIENT_ID', '');
    await expect(google.beginLogin()).rejects.toMatchObject({ status: 503 });
    vi.stubEnv('GOOGLE_OIDC_CLIENT_ID', 'test-client');
    vi.stubEnv('GOOGLE_OIDC_REDIRECT_URI', 'invalid-uri');
    await expect(google.beginLogin()).rejects.toMatchObject({ status: 503 });
  });

  it.each([
    'state',
    'nonce',
    'issuer',
    'audience',
    'expiry',
    'signature',
    'subject',
    'provider-error',
    'browser-binding',
    'flow-expiry',
  ])(
    'rejects invalid %s without disclosing protocol details',
    async (failure) => {
      const flow = await login();
      if (failure === 'state') flow.query.set('state', 'wrong');
      if (failure === 'nonce') overrides.nonce = 'wrong';
      if (failure === 'issuer') overrides.iss = 'https://attacker.example';
      if (failure === 'audience') overrides.aud = 'wrong-client';
      if (failure === 'expiry')
        overrides.exp = Math.floor(Date.now() / 1000) - 600;
      if (failure === 'signature') badSignature = true;
      if (failure === 'subject') overrides.sub = '';
      if (failure === 'provider-error') {
        flow.query.delete('code');
        flow.query.set('error', 'access_denied');
      }
      if (failure === 'flow-expiry')
        vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 601_000);
      try {
        await expect(
          google.completeLogin(
            flow.query.toString(),
            failure === 'browser-binding' ? 'wrong-browser' : flow.flowId,
          ),
        ).rejects.toMatchObject({
          response: {
            statusCode: 401,
            message: 'Google authentication could not be completed.',
          },
        });
      } finally {
        vi.restoreAllMocks();
      }
    },
  );
});

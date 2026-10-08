import type { INestApplication } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../../src/app.module.js';
import { DeviceAssistantService } from '../../../src/ai/device-assistant.service.js';
import { GeminiClientService } from '../../../src/ai/gemini/gemini-client.service.js';
import { GeminiEmbeddingService } from '../../../src/ai/rag/gemini-embedding.service.js';
import { AuthSessionService } from '../../../src/auth/auth-session.service.js';
import { GoogleOidcService } from '../../../src/auth/google-oidc.service.js';

describe('Authentication HTTP boundary', () => {
  let app: INestApplication;
  let sessions: AuthSessionService;
  const principal = {
    id: 'verified-sub',
    email: 'user@example.test',
    displayName: 'User',
  };
  const google = { beginLogin: vi.fn(), completeLogin: vi.fn() };
  beforeAll(async () => {
    vi.stubEnv(
      'AUTH_SESSION_SECRET',
      'test-session-secret-at-least-32-characters',
    );
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DeviceAssistantService)
      .useValue({
        askDeviceAssistant: vi.fn().mockResolvedValue({
          interactionId: 'test-supplied-id',
          answer: 'Public answer',
        }),
      })
      .overrideProvider(GeminiClientService)
      .useValue({})
      .overrideProvider(GeminiEmbeddingService)
      .useValue({})
      .overrideProvider(GoogleOidcService)
      .useValue(google)
      .compile();
    sessions = module.get(AuthSessionService);
    app = module.createNestApplication();
    await app.init();
  });
  beforeEach(() => {
    google.beginLogin.mockReset();
    google.completeLogin.mockReset();
  });
  afterAll(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it('explicitly starts login and binds the browser with an HttpOnly flow cookie', async () => {
    google.beginLogin.mockResolvedValue({
      authorizationUrl: 'https://accounts.google.com/authorize?state=test',
      flowId: 'browser-flow',
    });
    const response = await request(app.getHttpServer())
      .get('/auth/google/login')
      .expect(302);
    expect(response.headers.location).toBe(
      'https://accounts.google.com/authorize?state=test',
    );
    expect(response.headers['set-cookie'][0]).toContain(
      'iot_oidc_flow=browser-flow',
    );
    expect(response.headers['set-cookie'][0]).toMatch(/HttpOnly/);
    expect(response.headers['set-cookie'][0]).toMatch(/SameSite=Lax/);
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('creates a session only from the verified callback principal, then redirects to /auth/me', async () => {
    google.completeLogin.mockResolvedValue(principal);
    const response = await request(app.getHttpServer())
      .get('/auth/google/callback?code=code&state=state&sub=attacker')
      .set('Cookie', 'iot_oidc_flow=browser-flow')
      .expect(302);
    expect(google.completeLogin).toHaveBeenCalledWith(
      '?code=code&state=state&sub=attacker',
      'browser-flow',
    );
    expect(response.headers.location).toBe('/auth/me');
    expect(response.headers['set-cookie'][0]).toContain('Max-Age=0');
    const cookie = response.headers['set-cookie'].find((value: string) =>
      value.startsWith('iot_session='),
    );
    expect(cookie).toContain('HttpOnly');
    expect(cookie).not.toContain(principal.id);
    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', cookie.split(';')[0])
      .expect(200);
    expect(me.body).toEqual(principal);
    expect(me.headers['cache-control']).toBe('no-store');
  });
  it('clears the browser session on logout without contacting Google', async () => {
    const browser = request.agent(app.getHttpServer());
    google.completeLogin.mockResolvedValue(principal);
    await browser.get('/auth/google/callback?code=test&state=test').expect(302);
    const me = await browser.get('/auth/me').expect(200);
    expect(me.body).toEqual(principal);
    google.completeLogin.mockClear();

    const response = await browser.post('/auth/logout').expect(204);
    expect(response.text).toBe('');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toHaveLength(1);
    const cookie = response.headers['set-cookie'][0];
    for (const attribute of [
      'iot_session=;',
      'Max-Age=0',
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
    ])
      expect(cookie).toContain(attribute);
    await browser.get('/auth/me').expect(401);
    for (const decision of ['approve', 'reject'])
      await browser.post(`/ai/pending-actions/missing/${decision}`).expect(401);
    await browser.post('/auth/logout').expect(204);
    expect(google.beginLogin).not.toHaveBeenCalled();
    expect(google.completeLogin).not.toHaveBeenCalled();
  });
  it.each([undefined, 'iot_session=tampered'])(
    'logs out unauthenticated callers without session configuration: %s',
    async (cookie) => {
      vi.stubEnv('AUTH_SESSION_SECRET', '');
      try {
        const call = request(app.getHttpServer()).post('/auth/logout');
        if (cookie) call.set('Cookie', cookie);
        const response = await call.expect(204);
        expect(response.text).toBe('');
        expect(response.headers['set-cookie'][0]).toContain(
          'iot_session=; Max-Age=0',
        );
        expect(google.beginLogin).not.toHaveBeenCalled();
        expect(google.completeLogin).not.toHaveBeenCalled();
      } finally {
        vi.stubEnv(
          'AUTH_SESSION_SECRET',
          'test-session-secret-at-least-32-characters',
        );
      }
    },
  );

  it('never establishes a session on a rejected callback', async () => {
    google.completeLogin.mockRejectedValue(
      new UnauthorizedException(
        'Google authentication could not be completed.',
      ),
    );
    const response = await request(app.getHttpServer())
      .get('/auth/google/callback?error=access_denied')
      .expect(401);
    expect(response.headers['set-cookie'].join()).not.toContain('iot_session=');
    expect(response.body).toEqual({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Google authentication could not be completed.',
    });
  });
  it('returns 401 for missing, tampered and expired sessions', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
    const cookie = (await sessions.createSessionCookie(principal)).split(
      ';',
    )[0];
    await request(app.getHttpServer())
      .get('/auth/me')
      .set(
        'Cookie',
        cookie.slice(0, 100) +
          (cookie[100] === 'a' ? 'b' : 'a') +
          cookie.slice(101),
      )
      .expect(401);
    const clock = vi
      .spyOn(Date, 'now')
      .mockReturnValue(Date.now() + 2 * 60 * 60 * 1000 + 1);
    try {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', cookie)
        .expect(401);
      for (const decision of ['approve', 'reject'])
        await request(app.getHttpServer())
          .post(`/ai/pending-actions/missing/${decision}`)
          .set('Cookie', cookie)
          .expect(401);
    } finally {
      clock.mockRestore();
    }
  });
  it('uses Secure cookies in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      expect(await sessions.createSessionCookie(principal)).toContain('Secure');
      expect(sessions.clearSessionCookie()).toContain('Secure');
      const response = await request(app.getHttpServer())
        .post('/auth/logout')
        .expect(204);
      expect(response.headers['set-cookie'][0]).toContain('Secure');
    } finally {
      vi.stubEnv('NODE_ENV', 'test');
    }
  });
  it('leaves device-assistant requests public', async () => {
    const response = await request(app.getHttpServer())
      .post('/ai/device-assistant')
      .send({ message: 'How is the device?' })
      .expect(200);
    expect(response.body).toEqual({
      interactionId: 'test-supplied-id',
      answer: 'Public answer',
    });
  });
  it('fails closed when the session secret is missing without requiring Google configuration at bootstrap', async () => {
    vi.stubEnv('AUTH_SESSION_SECRET', '');
    try {
      await request(app.getHttpServer()).get('/auth/google/login').expect(503);
      expect(google.beginLogin).not.toHaveBeenCalled();
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    } finally {
      vi.stubEnv(
        'AUTH_SESSION_SECRET',
        'test-session-secret-at-least-32-characters',
      );
    }
  });
});

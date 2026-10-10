import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../../src/app.module.js';
import { DeviceAssistantService } from '../../../src/ai/device-assistant.service.js';
import { GeminiClientService } from '../../../src/ai/gemini/gemini-client.service.js';
import { McpDeviceClientService } from '../../../src/ai/mcp/mcp-device-client.service.js';
import { GeminiEmbeddingService } from '../../../src/ai/rag/gemini-embedding.service.js';
import { GoogleOidcService } from '../../../src/auth/google-oidc.service.js';
import { OpaPendingActionPolicyClient } from '../../../src/authorization/opa-pending-action-policy.client.js';

describe('Application health HTTP boundary', () => {
  let app: INestApplication;
  const unavailable = vi.fn(() => {
    throw new Error('External systems must not be invoked by health checks');
  });

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DeviceAssistantService)
      .useValue({ askDeviceAssistant: unavailable })
      .overrideProvider(GeminiClientService)
      .useValue({
        startInteraction: unavailable,
        continueWithFunctionResults: unavailable,
      })
      .overrideProvider(GeminiEmbeddingService)
      .useValue({ embedQuery: unavailable, embedDocument: unavailable })
      .overrideProvider(McpDeviceClientService)
      .useValue({ listTools: unavailable, callTool: unavailable })
      .overrideProvider(GoogleOidcService)
      .useValue({ beginLogin: unavailable, completeLogin: unavailable })
      .overrideProvider(OpaPendingActionPolicyClient)
      .useValue({ evaluate: unavailable })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(['live', 'ready'])(
    'serves public /health/%s without invoking external capabilities',
    async (endpoint) => {
      const response = await request(app.getHttpServer())
        .get(`/health/${endpoint}`)
        .expect(200);

      expect(response.body).toEqual({ status: 'ok' });
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(unavailable).not.toHaveBeenCalled();
    },
  );
});

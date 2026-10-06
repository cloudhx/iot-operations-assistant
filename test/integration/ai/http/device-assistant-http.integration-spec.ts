import { type INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import {
  DeviceAssistantInteractionError,
  type DeviceAssistantResult,
} from '../../../../src/ai/device-assistant.contract.js';
import { DeviceAssistantService } from '../../../../src/ai/device-assistant.service.js';
import { GeminiClientService } from '../../../../src/ai/gemini/gemini-client.service.js';
import { GeminiEmbeddingService } from '../../../../src/ai/rag/gemini-embedding.service.js';
import { AppModule } from '../../../../src/app.module.js';

describe('Device Assistant HTTP boundary', () => {
  const askDeviceAssistant =
    vi.fn<(message: string) => Promise<DeviceAssistantResult>>();
  let application: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DeviceAssistantService)
      .useValue({ askDeviceAssistant })
      // These SDK providers require credentials at construction; this boundary
      // test must remain independent of Gemini credentials and network access.
      .overrideProvider(GeminiClientService)
      .useValue({})
      .overrideProvider(GeminiEmbeddingService)
      .useValue({})
      .compile();

    application = module.createNestApplication();
    await application.init();
  });

  beforeEach(() => {
    askDeviceAssistant.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await application.close();
  });

  it('returns the interaction ID and answer for a valid request', async () => {
    askDeviceAssistant.mockResolvedValue({
      interactionId: 'ai-interaction-001',
      answer: 'The latest device evidence is available.',
    });

    await request(application.getHttpServer())
      .post('/ai/device-assistant')
      .send({ message: 'What is happening with vibration-sensor-001?' })
      .expect(200)
      .expect({
        interactionId: 'ai-interaction-001',
        answer: 'The latest device evidence is available.',
      });

    expect(askDeviceAssistant).toHaveBeenCalledWith(
      'What is happening with vibration-sensor-001?',
    );
  });

  it.each([
    ['empty message', { message: '' }],
    ['blank message', { message: '   ' }],
    ['non-string message', { message: 42 }],
    ['unexpected property', { message: 'Inspect it.', admin: true }],
  ])('rejects an invalid request with 400: %s', async (_case, body) => {
    await request(application.getHttpServer())
      .post('/ai/device-assistant')
      .send(body)
      .expect(400);

    expect(askDeviceAssistant).not.toHaveBeenCalled();
  });

  it('returns a sanitized correlated response for an internal failure', async () => {
    const internalMessage = 'Gemini transport exposed-internal-detail';
    const loggerError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    askDeviceAssistant.mockRejectedValue(
      new DeviceAssistantInteractionError(
        'ai-interaction-003',
        new Error(internalMessage),
      ),
    );

    const response = await request(application.getHttpServer())
      .post('/ai/device-assistant')
      .send({ message: 'Inspect the device.' })
      .expect(500);

    expect(response.body).toEqual({
      statusCode: 500,
      error: 'AI_INTERACTION_FAILED',
      message: 'The assistant could not complete the request.',
      interactionId: 'ai-interaction-003',
    });
    expect(JSON.stringify(response.body)).not.toContain(internalMessage);
    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining('ai-interaction-003'),
      expect.stringContaining(internalMessage),
    );
  });
});

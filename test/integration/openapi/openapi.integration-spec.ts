import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../../src/app.module.js';
import { DeviceAssistantService } from '../../../src/ai/device-assistant.service.js';
import { GeminiClientService } from '../../../src/ai/gemini/gemini-client.service.js';
import { GeminiEmbeddingService } from '../../../src/ai/rag/gemini-embedding.service.js';
import { configureOpenApi } from '../../../src/openapi/configure-openapi.js';

describe('Device assistant OpenAPI contract', () => {
  const askDeviceAssistant = vi.fn();
  let application: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DeviceAssistantService)
      .useValue({ askDeviceAssistant })
      .overrideProvider(GeminiClientService)
      .useValue({})
      .overrideProvider(GeminiEmbeddingService)
      .useValue({})
      .compile();

    application = module.createNestApplication();
    configureOpenApi(application);
    await application.init();
  });

  afterAll(async () => {
    await application.close();
  });

  it('publishes the request and success/failure response schemas', async () => {
    const response = await request(application.getHttpServer())
      .get('/docs-json')
      .expect(200)
      .expect('Content-Type', /json/);
    const document = response.body;

    expect(document.paths['/ai/device-assistant'].post).toMatchObject({
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/AskDeviceAssistantRequestDto',
            },
          },
        },
      },
      responses: {
        '200': {
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/DeviceAssistantResponseDto',
              },
            },
          },
        },
        '400': { description: expect.any(String) },
        '500': {
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/DeviceAssistantErrorResponseDto',
              },
            },
          },
        },
      },
    });

    const schemas = document.components.schemas;
    expect(schemas.AskDeviceAssistantRequestDto).toMatchObject({
      type: 'object',
      required: ['message'],
      properties: { message: { type: 'string', pattern: '\\S' } },
    });
    expect(schemas.DeviceAssistantResponseDto).toMatchObject({
      required: expect.arrayContaining(['interactionId', 'answer']),
      properties: {
        interactionId: { type: 'string' },
        answer: { type: 'string' },
      },
    });
    expect(schemas.DeviceAssistantErrorResponseDto).toMatchObject({
      required: expect.arrayContaining([
        'statusCode',
        'error',
        'message',
        'interactionId',
      ]),
      properties: {
        statusCode: { type: 'number', enum: [500] },
        error: { type: 'string', enum: ['AI_INTERACTION_FAILED'] },
        message: { type: 'string' },
        interactionId: { type: 'string' },
      },
    });
    expect(
      Object.keys(schemas.DeviceAssistantErrorResponseDto.properties).sort(),
    ).toEqual(['error', 'interactionId', 'message', 'statusCode']);
    expect(askDeviceAssistant).not.toHaveBeenCalled();
  });

  it('mounts Swagger UI at /docs', async () => {
    await request(application.getHttpServer())
      .get('/docs')
      .expect(200)
      .expect('Content-Type', /html/);
    expect(askDeviceAssistant).not.toHaveBeenCalled();
  });
});

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

  it('documents authentication and actor records, with cookie security only on protected routes', async () => {
    const response = await request(application.getHttpServer())
      .get('/docs-json')
      .expect(200);
    const { paths, components } = response.body;
    expect(components.securitySchemes.session).toEqual({
      type: 'apiKey',
      in: 'cookie',
      name: 'iot_session',
    });
    expect(paths['/auth/google/login'].get.responses['302']).toBeDefined();
    expect(paths['/auth/google/callback'].get.responses['401']).toBeDefined();
    expect(paths['/auth/logout'].post.responses).toEqual({
      '204': {
        description:
          'Clear the local application session only; authentication is not required.',
      },
    });
    expect(paths['/auth/logout'].post.security).toBeUndefined();
    expect(paths['/auth/logout'].post.requestBody).toBeUndefined();
    expect(paths['/auth/me'].get.security).toEqual([{ session: [] }]);
    expect(paths['/ai/device-assistant'].post.security).toBeUndefined();
    expect(paths['/ai/pending-actions/{id}'].get.security).toBeUndefined();
    expect(
      components.schemas.PendingActionResponseDto.properties.approvedAt,
    ).toMatchObject({ type: 'string', format: 'date-time' });
    expect(
      components.schemas.PendingActionResponseDto.properties.rejectedAt,
    ).toMatchObject({ type: 'string', format: 'date-time' });
    expect(
      components.schemas.PendingActionResponseDto.properties.approvedBy,
    ).toBeDefined();
    expect(
      components.schemas.PendingActionResponseDto.properties.rejectedBy,
    ).toBeDefined();
  });

  it('mounts Swagger UI at /docs', async () => {
    await request(application.getHttpServer())
      .get('/docs')
      .expect(200)
      .expect('Content-Type', /html/);
    expect(askDeviceAssistant).not.toHaveBeenCalled();
  });

  it('documents pending-action review and decisions without editable arguments', async () => {
    const response = await request(application.getHttpServer())
      .get('/docs-json')
      .expect(200);
    const { paths, components } = response.body;
    const success = {
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/PendingActionResponseDto' },
        },
      },
    };
    const failure = {
      content: {
        'application/json': {
          schema: {
            $ref: '#/components/schemas/PendingActionErrorResponseDto',
          },
        },
      },
    };
    expect(paths['/ai/pending-actions/{id}'].get.responses).toMatchObject({
      '200': success,
      '404': failure,
    });
    for (const decision of ['approve', 'reject']) {
      expect(paths[`/ai/pending-actions/{id}/${decision}`].post).toMatchObject({
        security: [{ session: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: { type: 'object', additionalProperties: false },
            },
          },
        },
        responses: {
          '200': success,
          '400': { description: expect.any(String) },
          '401': { description: expect.any(String) },
          '403': failure,
          '503': failure,
          '404': failure,
          '409': failure,
        },
      });
    }
    expect(components.schemas.PendingActionResponseDto).toMatchObject({
      properties: {
        createdAt: { type: 'string', format: 'date-time' },
        arguments: { $ref: '#/components/schemas/PendingActionArgumentsDto' },
        result: {
          allOf: expect.arrayContaining([
            { $ref: '#/components/schemas/PendingActionWorkOrderResultDto' },
          ]),
        },
      },
    });
    expect(
      components.schemas.PendingActionWorkOrderResultDto.properties.createdAt,
    ).toMatchObject({ type: 'string', format: 'date-time' });
    expect(askDeviceAssistant).not.toHaveBeenCalled();
  });
});

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../../../src/app.module.js';
import { PendingActionsService } from '../../../../src/ai/actions/pending-actions.service.js';
import { DeviceAssistantService } from '../../../../src/ai/device-assistant.service.js';
import { GeminiClientService } from '../../../../src/ai/gemini/gemini-client.service.js';
import { GeminiEmbeddingService } from '../../../../src/ai/rag/gemini-embedding.service.js';
import { MaintenanceWorkOrdersService } from '../../../../src/maintenance-work-orders/maintenance-work-orders.service.js';

describe('Pending actions HTTP boundary', () => {
  const askDeviceAssistant = vi.fn();
  let app: INestApplication;
  let pendingActions: PendingActionsService;
  let workOrders: MaintenanceWorkOrdersService;
  const proposal = {
    deviceId: 'vibration-sensor-001',
    component: 'motor-bearing',
    reason: 'Inspect bearing',
  };
  const createAction = () =>
    pendingActions.createMaintenanceWorkOrderAction(
      'create_maintenance_work_order',
      proposal,
    );

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DeviceAssistantService)
      .useValue({ askDeviceAssistant })
      .overrideProvider(GeminiClientService)
      .useValue({})
      .overrideProvider(GeminiEmbeddingService)
      .useValue({})
      .compile();
    pendingActions = module.get(PendingActionsService);
    workOrders = module.get(MaintenanceWorkOrdersService);
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(() => {
    expect(askDeviceAssistant).not.toHaveBeenCalled();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reviews the exact frozen proposal with an ISO timestamp', async () => {
    const action = createAction();
    const response = await request(app.getHttpServer())
      .get(`/ai/pending-actions/${action.id}`)
      .expect(200);
    expect(response.body).toEqual({
      id: action.id,
      toolName: action.toolName,
      status: 'PENDING_APPROVAL',
      createdAt: action.createdAt.toISOString(),
      arguments: proposal,
    });
  });

  it.each(['review', 'approve', 'reject'])(
    'maps unknown action to 404: %s',
    async (decision) => {
      const path = '/ai/pending-actions/missing';
      const client = request(app.getHttpServer());
      const response = await (
        decision === 'review'
          ? client.get(path)
          : client.post(`${path}/${decision}`)
      ).expect(404);
      expect(response.body).toEqual({
        statusCode: 404,
        error: 'PENDING_ACTION_NOT_FOUND',
        message: 'The pending action was not found.',
        actionId: 'missing',
      });
    },
  );

  it('approves once and returns the identical completed result on duplicate approval', async () => {
    const action = createAction();
    const count = workOrders.count();
    const path = `/ai/pending-actions/${action.id}/approve`;
    const first = await request(app.getHttpServer()).post(path).expect(200);
    expect(first.body).toMatchObject({
      id: action.id,
      status: 'COMPLETED',
      arguments: proposal,
      result: { ...proposal, status: 'OPEN' },
    });
    expect(first.body.result.createdAt).toBe(
      new Date(first.body.result.createdAt).toISOString(),
    );
    expect(workOrders.count()).toBe(count + 1);
    expect(pendingActions.findById(action.id)?.status).toBe('COMPLETED');

    const second = await request(app.getHttpServer())
      .post(path)
      .send({})
      .expect(200);
    expect(second.body).toEqual(first.body);
    expect(workOrders.count()).toBe(count + 1);
    const reviewed = await request(app.getHttpServer())
      .get(`/ai/pending-actions/${action.id}`)
      .expect(200);
    expect(reviewed.body).toEqual(first.body);
  });

  it('rejects without execution and refuses approval or repeated rejection', async () => {
    const action = createAction();
    const count = workOrders.count();
    const path = `/ai/pending-actions/${action.id}`;
    const rejected = await request(app.getHttpServer())
      .post(`${path}/reject`)
      .expect(200);
    expect(rejected.body.status).toBe('REJECTED');
    expect(rejected.body).not.toHaveProperty('result');
    expect(pendingActions.findById(action.id)?.status).toBe('REJECTED');
    for (const decision of ['approve', 'reject']) {
      const conflict = await request(app.getHttpServer())
        .post(`${path}/${decision}`)
        .expect(409);
      expect(conflict.body).toEqual({
        statusCode: 409,
        error: 'PENDING_ACTION_STATE_CONFLICT',
        actionId: action.id,
        message:
          'The pending action does not allow this decision in its current state.',
      });
    }
    expect(workOrders.count()).toBe(count);
  });

  it('refuses rejection of a completed action', async () => {
    const action = createAction();
    const path = `/ai/pending-actions/${action.id}`;
    await request(app.getHttpServer()).post(`${path}/approve`).expect(200);
    await request(app.getHttpServer()).post(`${path}/reject`).expect(409);
    expect(pendingActions.findById(action.id)?.status).toBe('COMPLETED');
  });

  it.each(['approve', 'reject'])(
    'refuses a decision on an APPROVED action: %s',
    async (decision) => {
      const action = createAction();
      pendingActions.markApproved(action.id);
      const count = workOrders.count();
      await request(app.getHttpServer())
        .post(`/ai/pending-actions/${action.id}/${decision}`)
        .expect(409);
      expect(workOrders.count()).toBe(count);
      expect(pendingActions.findById(action.id)?.status).toBe('APPROVED');
    },
  );

  it.each(['approve', 'reject'])(
    'rejects replacement arguments before applying the decision: %s',
    async (decision) => {
      const action = createAction();
      const count = workOrders.count();
      await request(app.getHttpServer())
        .post(`/ai/pending-actions/${action.id}/${decision}`)
        .send({ deviceId: 'different-device', reason: 'Changed payload' })
        .expect(400);
      expect(pendingActions.findById(action.id)).toMatchObject({
        status: 'PENDING_APPROVAL',
        arguments: proposal,
      });
      expect(workOrders.count()).toBe(count);
    },
  );
});

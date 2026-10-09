import { OpaPendingActionPolicyClient } from '../../../../src/authorization/opa-pending-action-policy.client.js';
import { OpaPdpError } from '../../../../src/authorization/opa-pdp.error.js';
import { McpDeviceClientService } from '../../../../src/ai/mcp/mcp-device-client.service.js';
import { AuthSessionService } from '../../../../src/auth/auth-session.service.js';
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
  const evaluate = vi.fn();
  const mcpCall = vi.fn();
  let cookie: string;
  let cookieB: string;
  const actor = { id: 'actor-a', email: 'a@example.test' };
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
    vi.stubEnv(
      'AUTH_SESSION_SECRET',
      'test-session-secret-at-least-32-characters',
    );
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OpaPendingActionPolicyClient)
      .useValue({ evaluate })
      .overrideProvider(McpDeviceClientService)
      .useValue({ discoverTools: mcpCall, execute: mcpCall })
      .overrideProvider(DeviceAssistantService)
      .useValue({ askDeviceAssistant })
      .overrideProvider(GeminiClientService)
      .useValue({})
      .overrideProvider(GeminiEmbeddingService)
      .useValue({})
      .compile();
    const sessions = module.get(AuthSessionService);
    cookie = (await sessions.createSessionCookie(actor)).split(';')[0];
    cookieB = (await sessions.createSessionCookie({ id: 'actor-b' })).split(
      ';',
    )[0];
    pendingActions = module.get(PendingActionsService);
    workOrders = module.get(MaintenanceWorkOrdersService);
    app = module.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    evaluate.mockReset().mockResolvedValue(true);
  });

  afterEach(() => {
    expect(mcpCall).not.toHaveBeenCalled();
    expect(askDeviceAssistant).not.toHaveBeenCalled();
  });

  afterAll(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it.each(['approve', 'reject'])(
    'requires authentication before lookup or execution: %s',
    async (decision) => {
      const action = createAction();
      const count = workOrders.count();
      for (const id of [action.id, 'missing']) {
        await request(app.getHttpServer())
          .post(`/ai/pending-actions/${id}/${decision}`)
          .expect(401);
        await request(app.getHttpServer())
          .post(`/ai/pending-actions/${id}/${decision}`)
          .set('Cookie', 'iot_session=tampered')
          .expect(401);
      }
      expect(pendingActions.findById(action.id)?.status).toBe(
        'PENDING_APPROVAL',
      );
      expect(workOrders.count()).toBe(count);
      expect(evaluate).not.toHaveBeenCalled();
    },
  );

  it.each(['approve', 'reject'])(
    'never accepts a caller-supplied actor: %s',
    async (decision) => {
      const action = createAction();
      const count = workOrders.count();
      await request(app.getHttpServer())
        .post(`/ai/pending-actions/${action.id}/${decision}`)
        .set('Cookie', cookie)
        .send({ actor: { id: 'forged-actor' } })
        .expect(400);
      expect(pendingActions.findById(action.id)?.status).toBe(
        'PENDING_APPROVAL',
      );
      expect(workOrders.count()).toBe(count);
      expect(evaluate).not.toHaveBeenCalled();
    },
  );

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
          : client.post(`${path}/${decision}`).set('Cookie', cookie)
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
    const first = await request(app.getHttpServer())
      .post(path)
      .expect(200)
      .set('Cookie', cookie);
    expect(first.body).toMatchObject({
      id: action.id,
      status: 'COMPLETED',
      approvedBy: actor,
      approvedAt: expect.any(String),
      arguments: proposal,
      result: { ...proposal, status: 'OPEN' },
    });
    expect(first.body.approvedAt).toBe(
      new Date(first.body.approvedAt).toISOString(),
    );
    expect(first.body.result.createdAt).toBe(
      new Date(first.body.result.createdAt).toISOString(),
    );
    expect(workOrders.count()).toBe(count + 1);
    expect(pendingActions.findById(action.id)?.status).toBe('COMPLETED');

    expect(evaluate).toHaveBeenCalledTimes(1);
    evaluate.mockRejectedValue(new OpaPdpError('PDP down'));
    const second = await request(app.getHttpServer())
      .post(path)
      .set('Cookie', cookieB)
      .send({})
      .expect(200);
    expect(second.body).toEqual(first.body);
    expect(evaluate).toHaveBeenCalledTimes(1);
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
      .set('Cookie', cookie)
      .expect(200);
    expect(rejected.body.status).toBe('REJECTED');
    expect(rejected.body.rejectedBy).toEqual(actor);
    expect(rejected.body.rejectedAt).toBe(
      new Date(rejected.body.rejectedAt).toISOString(),
    );
    expect(rejected.body).not.toHaveProperty('result');
    expect(pendingActions.findById(action.id)?.status).toBe('REJECTED');
    evaluate.mockResolvedValue(false);
    for (const decision of ['approve', 'reject']) {
      const conflict = await request(app.getHttpServer())
        .post(`${path}/${decision}`)
        .set('Cookie', cookieB)
        .expect(409);
      expect(conflict.body).toEqual({
        statusCode: 409,
        error: 'PENDING_ACTION_STATE_CONFLICT',
        actionId: action.id,
        message:
          'The pending action does not allow this decision in its current state.',
      });
    }
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(workOrders.count()).toBe(count);
    expect(pendingActions.findById(action.id)?.rejectedBy).toEqual(actor);
    expect(pendingActions.findById(action.id)?.rejectedAt?.toISOString()).toBe(
      rejected.body.rejectedAt,
    );
  });

  it('refuses rejection of a completed action', async () => {
    const action = createAction();
    const path = `/ai/pending-actions/${action.id}`;
    await request(app.getHttpServer())
      .post(`${path}/approve`)
      .expect(200)
      .set('Cookie', cookie);
    await request(app.getHttpServer())
      .post(`${path}/reject`)
      .expect(409)
      .set('Cookie', cookie);
    expect(pendingActions.findById(action.id)?.status).toBe('COMPLETED');
  });

  it.each(['approve', 'reject'])(
    'refuses a decision on an APPROVED action: %s',
    async (decision) => {
      const action = createAction();
      pendingActions.markApproved(action.id, actor);
      const count = workOrders.count();
      await request(app.getHttpServer())
        .post(`/ai/pending-actions/${action.id}/${decision}`)
        .set('Cookie', cookie)
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
        .set('Cookie', cookie)
        .send({ deviceId: 'different-device', reason: 'Changed payload' })
        .expect(400);
      expect(pendingActions.findById(action.id)).toMatchObject({
        status: 'PENDING_APPROVAL',
        arguments: proposal,
      });
      expect(workOrders.count()).toBe(count);
      expect(evaluate).not.toHaveBeenCalled();
    },
  );
  it.each(['approve', 'reject'])(
    'constructs trusted principal, action and resource for %s',
    async (decision) => {
      const action = createAction();
      await request(app.getHttpServer())
        .post(`/ai/pending-actions/${action.id}/${decision}`)
        .set('Cookie', cookie)
        .expect(200);
      expect(evaluate).toHaveBeenCalledExactlyOnceWith({
        principal: { id: actor.id },
        action: `${decision}_pending_action`,
        resource: { type: 'maintenance_work_order', status: action.status },
      });
    },
  );

  it.each(['approve', 'reject'])(
    'rejects forged authorization context before calling PDP: %s',
    async (decision) => {
      const action = createAction();
      await request(app.getHttpServer())
        .post(`/ai/pending-actions/${action.id}/${decision}`)
        .set('Cookie', cookie)
        .send({
          principal: { id: 'forged' },
          action: 'approve_pending_action',
          resource: { type: 'device', status: 'COMPLETED' },
        })
        .expect(400);
      expect(evaluate).not.toHaveBeenCalled();
      expect(pendingActions.findById(action.id)?.status).toBe(
        'PENDING_APPROVAL',
      );
    },
  );

  it.each(['approve', 'reject'])(
    'maps explicit policy denial to 403 without changing state: %s',
    async (decision) => {
      evaluate.mockResolvedValue(false);
      const action = createAction();
      const count = workOrders.count();
      const response = await request(app.getHttpServer())
        .post(`/ai/pending-actions/${action.id}/${decision}`)
        .set('Cookie', cookie)
        .expect(403);
      expect(response.body).toEqual({
        statusCode: 403,
        error: 'PENDING_ACTION_AUTHORIZATION_DENIED',
        message: 'You are not allowed to make this pending action decision.',
        actionId: action.id,
      });
      expect(pendingActions.findById(action.id)).toEqual(action);
      expect(workOrders.count()).toBe(count);
    },
  );

  it.each(['approve', 'reject'])(
    'maps PDP failure to sanitized 503 without changing state: %s',
    async (decision) => {
      evaluate.mockRejectedValue(
        new OpaPdpError(
          'http://private-opa:8181 returned internal policy/stack details',
          { cause: new Error('provider secret') },
        ),
      );
      const action = createAction();
      const count = workOrders.count();
      const response = await request(app.getHttpServer())
        .post(`/ai/pending-actions/${action.id}/${decision}`)
        .set('Cookie', cookie)
        .expect(503);
      expect(response.body).toEqual({
        statusCode: 503,
        error: 'PENDING_ACTION_AUTHORIZATION_UNAVAILABLE',
        message:
          'Authorization is temporarily unavailable. Please try again later.',
        actionId: action.id,
      });
      expect(pendingActions.findById(action.id)).toEqual(action);
      expect(workOrders.count()).toBe(count);
    },
  );

  it('rechecks application state after waiting for PDP', async () => {
    const action = createAction();
    const count = workOrders.count();
    evaluate.mockImplementation(async () => {
      pendingActions.markRejected(action.id, actor);
      return true;
    });
    await request(app.getHttpServer())
      .post(`/ai/pending-actions/${action.id}/approve`)
      .set('Cookie', cookie)
      .expect(409);
    expect(workOrders.count()).toBe(count);
    expect(pendingActions.findById(action.id)?.status).toBe('REJECTED');
  });
});

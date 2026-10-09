import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthorizationModule } from './authorization.module.js';
import { OpaPdpError } from './opa-pdp.error.js';
import { OpaPendingActionPolicyClient } from './opa-pending-action-policy.client.js';
import type { PendingActionAuthorizationRequest } from './pending-action-authorization-request.js';

const request: PendingActionAuthorizationRequest = {
  principal: { id: 'user-123' },
  action: 'approve_pending_action',
  resource: { type: 'maintenance_work_order', status: 'PENDING_APPROVAL' },
};

describe('OpaPendingActionPolicyClient', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const client = new OpaPendingActionPolicyClient();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('OPA_URL', undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('registers an injectable client without contacting OPA or reading configuration', async () => {
    vi.stubEnv('OPA_URL', 'invalid');
    const module = await Test.createTestingModule({
      imports: [AuthorizationModule],
    }).compile();
    try {
      expect(module.get(OpaPendingActionPolicyClient)).toBeInstanceOf(
        OpaPendingActionPolicyClient,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      await module.close();
    }
  });

  it.each([true, false])(
    'returns the exact boolean policy decision %s',
    async (result) => {
      fetchMock.mockResolvedValue(Response.json({ result }));
      await expect(client.evaluate(request)).resolves.toBe(result);
      const [url, options] = fetchMock.mock.calls[0];
      expect(String(url)).toBe(
        'http://127.0.0.1:8181/v1/data/authz/pending_actions/allow',
      );
      expect(options).toMatchObject({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        redirect: 'error',
      });
      expect(options?.signal).toBeInstanceOf(AbortSignal);
      expect(JSON.parse(options?.body as string)).toEqual({ input: request });
    },
  );

  it('uses OPA_URL at evaluation time and handles a trailing slash', async () => {
    vi.stubEnv('OPA_URL', 'http://localhost:9191/');
    fetchMock.mockResolvedValue(Response.json({ result: true }));
    await client.evaluate({ ...request, action: 'reject_pending_action' });
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      'http://localhost:9191/v1/data/authz/pending_actions/allow',
    );
    expect(JSON.parse(options?.body as string).input.action).toBe(
      'reject_pending_action',
    );
  });

  it.each([{}, { result: null }, { result: 'true' }, { result: 1 }, null, []])(
    'rejects a missing or non-boolean result: %j',
    async (body) => {
      fetchMock.mockResolvedValue(Response.json(body));
      await expect(client.evaluate(request)).rejects.toBeInstanceOf(
        OpaPdpError,
      );
    },
  );

  it('rejects malformed JSON and preserves the parsing cause', async () => {
    fetchMock.mockResolvedValue(new Response('not json'));
    await expect(client.evaluate(request)).rejects.toMatchObject({
      name: 'OpaPdpError',
      cause: expect.any(SyntaxError),
    });
  });

  it.each([302, 403, 503])(
    'rejects HTTP %s even if its body says allow',
    async (status) => {
      fetchMock.mockResolvedValue(Response.json({ result: true }, { status }));
      await expect(client.evaluate(request)).rejects.toMatchObject({
        name: 'OpaPdpError',
        message: `OPA returned HTTP ${status}.`,
      });
    },
  );

  it('distinguishes connection failure from a policy denial and preserves its cause', async () => {
    const cause = new TypeError('fetch failed');
    fetchMock.mockRejectedValue(cause);
    await expect(client.evaluate(request)).rejects.toMatchObject({
      name: 'OpaPdpError',
      cause,
    });
  });

  it('uses a five-second deadline and rejects timeout without timing-based waits', async () => {
    const cause = new DOMException('Timed out', 'TimeoutError');
    const signal = AbortSignal.abort(cause);
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(signal);
    fetchMock.mockImplementation(async (_url, options) => {
      options?.signal?.throwIfAborted();
      return Response.json({ result: true });
    });
    await expect(client.evaluate(request)).rejects.toMatchObject({
      name: 'OpaPdpError',
      message: 'OPA evaluation timed out.',
      cause,
    });
    expect(timeout).toHaveBeenCalledWith(5000);
  });

  it.each(['invalid', 'file:///tmp/opa', ''])(
    'rejects invalid OPA_URL %j only on evaluation',
    async (url) => {
      vi.stubEnv('OPA_URL', url);
      await expect(client.evaluate(request)).rejects.toBeInstanceOf(
        OpaPdpError,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});

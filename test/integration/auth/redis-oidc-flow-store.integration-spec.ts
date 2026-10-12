import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { createClient } from '@redis/client';
import { RedisOidcFlowStore } from '../../../src/auth/redis-oidc-flow-store.js';
import { OIDC_FLOW_TTL_SECONDS } from '../../../src/auth/oidc-flow-store.js';

// Requires a real local Redis. This suite deliberately fails if it is unavailable.
describe('Real Redis OIDC flow storage', () => {
  const first = new RedisOidcFlowStore();
  const second = new RedisOidcFlowStore();
  const inspector = createClient({
    url: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
    socket: { connectTimeout: 5000, reconnectStrategy: false },
    commandOptions: { timeout: 5000 },
    disableOfflineQueue: true,
  });
  const keys: string[] = [];
  const flow = {
    state: 'test-state',
    nonce: 'test-nonce',
    verifier: 'test-verifier',
  };
  const id = () => {
    const value = `test-${randomUUID()}`;
    keys.push(`oidc:flow:${value}`);
    return value;
  };

  beforeAll(async () => {
    inspector.on('error', () => {});
    await inspector.connect();
  });
  afterAll(async () => {
    await Promise.all([first.onModuleDestroy(), second.onModuleDestroy()]);
    if (inspector.isOpen) {
      try {
        if (keys.length) await inspector.del(keys);
      } finally {
        await inspector.close();
      }
    }
  });

  it('stores only protocol values under the namespace with the ten-minute TTL', async () => {
    const handle = id();
    await first.store(handle, flow, OIDC_FLOW_TTL_SECONDS);
    expect(JSON.parse((await inspector.get(`oidc:flow:${handle}`))!)).toEqual(
      flow,
    );
    const ttl = await inspector.ttl(`oidc:flow:${handle}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(600);
  });

  it('shares state between instances and permits exactly one concurrent consumer', async () => {
    const handle = id();
    await first.store(handle, flow, 600);
    const results = await Promise.all([
      first.consume(handle),
      second.consume(handle),
    ]);
    expect(results.filter(Boolean)).toEqual([flow]);
    expect(await second.consume(handle)).toBeUndefined();
    expect(await inspector.exists(`oidc:flow:${handle}`)).toBe(0);
  });

  it('treats missing flows as absent', async () => {
    expect(await first.consume(id())).toBeUndefined();
  });

  it('expires through Redis TTL rather than an application cleanup loop', async () => {
    const handle = id();
    await first.store(handle, flow, 1);
    const deadline = Date.now() + 3000;
    while (await inspector.exists(`oidc:flow:${handle}`)) {
      if (Date.now() >= deadline)
        throw new Error('Redis did not expire the test flow');
      await setTimeout(50);
    }
    expect(await second.consume(handle)).toBeUndefined();
  });

  it('does not overwrite an existing opaque handle', async () => {
    const handle = id();
    await first.store(handle, flow, 600);
    await expect(
      second.store(handle, { ...flow, state: 'replacement' }, 600),
    ).rejects.toThrow('OIDC flow storage is unavailable.');
    expect(await first.consume(handle)).toEqual(flow);
  });
});

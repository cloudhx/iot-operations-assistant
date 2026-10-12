import { createClient } from '@redis/client';
import { RedisOidcFlowStore } from './redis-oidc-flow-store.js';
import { OidcFlowStoreUnavailableError } from './oidc-flow-store.js';

vi.mock('@redis/client', () => ({ createClient: vi.fn() }));

describe('Redis OIDC flow-store boundary', () => {
  let store: RedisOidcFlowStore;
  let client: {
    isOpen: boolean;
    isReady: boolean;
    on: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    getDel: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  };
  const flow = { state: 'state', nonce: 'nonce', verifier: 'verifier' };

  beforeEach(() => {
    vi.mocked(createClient).mockClear();
    client = {
      isOpen: false,
      isReady: false,
      on: vi.fn(),
      connect: vi.fn(async () => {
        client.isOpen = true;
        client.isReady = true;
      }),
      set: vi.fn().mockResolvedValue('OK'),
      getDel: vi.fn().mockResolvedValue(null),
      close: vi.fn(async () => {
        client.isOpen = false;
      }),
      destroy: vi.fn(),
    };
    vi.mocked(createClient).mockReturnValue(
      client as unknown as ReturnType<typeof createClient>,
    );
    store = new RedisOidcFlowStore();
  });
  afterEach(async () => {
    await store.onModuleDestroy();
    vi.restoreAllMocks();
  });

  it('connects lazily, shares a connection, and stores a namespaced expiring value', async () => {
    expect(createClient).not.toHaveBeenCalled();
    await Promise.all([
      store.store('a', flow, 600),
      store.store('b', flow, 600),
    ]);
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.set).toHaveBeenCalledWith(
      'oidc:flow:a',
      JSON.stringify(flow),
      { EX: 600, NX: true },
    );
  });

  it('returns absent values and uses atomic GETDEL for consumption', async () => {
    expect(await store.consume('missing')).toBeUndefined();
    client.getDel.mockResolvedValueOnce(JSON.stringify(flow));
    expect(await store.consume('a')).toEqual(flow);
    expect(client.getDel).toHaveBeenCalledWith('oidc:flow:a');
  });

  it.each(['connect', 'set', 'getDel'])(
    'fails closed on %s failure',
    async (method) => {
      client[method as 'connect' | 'set' | 'getDel'].mockRejectedValueOnce(
        new Error('internal Redis details'),
      );
      const operation =
        method === 'getDel' ? store.consume('a') : store.store('a', flow, 600);
      await expect(operation).rejects.toBeInstanceOf(
        OidcFlowStoreUnavailableError,
      );
    },
  );

  it.each(['not-json', '{}', '{"state":1,"nonce":"n","verifier":"v"}'])(
    'rejects malformed stored data: %s',
    async (value) => {
      client.getDel.mockResolvedValueOnce(value);
      await expect(store.consume('a')).rejects.toBeInstanceOf(
        OidcFlowStoreUnavailableError,
      );
    },
  );

  it('closes the reusable client and prevents new operations after shutdown', async () => {
    await store.store('a', flow, 600);
    await store.onModuleDestroy();
    expect(client.close).toHaveBeenCalledTimes(1);
    await expect(store.consume('a')).rejects.toBeInstanceOf(
      OidcFlowStoreUnavailableError,
    );
  });
});

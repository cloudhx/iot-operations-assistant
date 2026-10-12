import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createClient } from '@redis/client';
import {
  OidcFlowStore,
  OidcFlowStoreUnavailableError,
  type OidcLoginFlow,
} from './oidc-flow-store.js';

@Injectable()
export class RedisOidcFlowStore
  extends OidcFlowStore
  implements OnModuleDestroy
{
  private readonly logger = new Logger(RedisOidcFlowStore.name);
  private client?: ReturnType<typeof createClient>;
  private connecting?: Promise<void>;
  private shuttingDown = false;

  private async connectedClient() {
    if (this.shuttingDown) throw new Error('OIDC flow store is shutting down');
    if (!this.client) {
      this.client = createClient({
        url: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
        socket: { connectTimeout: 5000, reconnectStrategy: false },
        commandOptions: { timeout: 5000 },
        disableOfflineQueue: true,
      });
      // Handle EventEmitter errors without logging URLs, credentials or flow data.
      this.client.on('error', () => {
        this.logger.warn('OIDC flow storage connection failed.');
      });
    }
    if (!this.client.isReady) {
      this.connecting ??= this.client.connect().then(() => undefined);
      try {
        await this.connecting;
      } finally {
        this.connecting = undefined;
      }
    }
    if (this.shuttingDown) throw new Error('OIDC flow store is shutting down');
    return this.client;
  }

  async store(
    id: string,
    flow: OidcLoginFlow,
    ttlSeconds: number,
  ): Promise<void> {
    try {
      const client = await this.connectedClient();
      const result = await client.set(
        `oidc:flow:${id}`,
        JSON.stringify({
          state: flow.state,
          nonce: flow.nonce,
          verifier: flow.verifier,
        }),
        {
          EX: ttlSeconds,
          NX: true,
        },
      );
      if (result !== 'OK') throw new Error('OIDC flow handle already exists');
    } catch (cause) {
      throw new OidcFlowStoreUnavailableError(cause);
    }
  }

  async consume(id: string): Promise<OidcLoginFlow | undefined> {
    try {
      const client = await this.connectedClient();
      const value = await client.getDel(`oidc:flow:${id}`);
      if (value === null) return undefined;
      const flow: unknown = JSON.parse(value);
      if (
        !flow ||
        typeof flow !== 'object' ||
        !('state' in flow) ||
        typeof flow.state !== 'string' ||
        !flow.state ||
        !('nonce' in flow) ||
        typeof flow.nonce !== 'string' ||
        !flow.nonce ||
        !('verifier' in flow) ||
        typeof flow.verifier !== 'string' ||
        !flow.verifier
      )
        throw new Error('Invalid stored OIDC flow');
      return { state: flow.state, nonce: flow.nonce, verifier: flow.verifier };
    } catch (cause) {
      throw new OidcFlowStoreUnavailableError(cause);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    await this.connecting?.catch(() => undefined);
    if (this.client?.isOpen) {
      try {
        await this.client.close();
      } catch {
        if (this.client.isOpen) this.client.destroy();
      }
    }
  }
}

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Client, type CallToolResult } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const MCP_PROTOCOL_VERSION = '2026-07-28';

@Injectable()
export class McpDeviceClientService implements OnModuleDestroy {
  private readonly logger = new Logger(McpDeviceClientService.name);
  private client: Client | undefined;
  private connectionPromise: Promise<Client> | undefined;
  private shuttingDown = false;

  async callTool(
    name: string,
    arguments_: Record<string, unknown>,
  ): Promise<CallToolResult> {
    const client = await this.getConnectedClient();

    return client.callTool({
      name,
      arguments: arguments_,
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;

    const connectingClient = this.connectionPromise
      ? await this.connectionPromise.catch(() => undefined)
      : undefined;
    const client = this.client ?? connectingClient;

    this.client = undefined;
    this.connectionPromise = undefined;

    if (client) {
      await client.close();
      this.logger.debug('MCP device client connection closed');
    }
  }

  private getConnectedClient(): Promise<Client> {
    if (this.shuttingDown) {
      throw new Error('MCP device client is shutting down');
    }

    if (this.client) {
      return Promise.resolve(this.client);
    }

    this.connectionPromise ??= this.connect();

    return this.connectionPromise;
  }

  private async connect(): Promise<Client> {
    const client = new Client(
      {
        name: 'iot-operations-assistant-device-assistant',
        version: '0.0.1',
      },
      {
        versionNegotiation: {
          mode: {
            pin: MCP_PROTOCOL_VERSION,
          },
        },
      },
    );
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['dist/mcp/mcp-main.js'],
      cwd: process.cwd(),
    });

    try {
      await client.connect(transport);

      if (this.shuttingDown) {
        throw new Error('MCP device client shut down while connecting');
      }

      this.client = client;
      this.logger.debug(
        `MCP device client connected using protocol ${MCP_PROTOCOL_VERSION}`,
      );

      return client;
    } catch (error) {
      await client.close().catch(() => undefined);
      throw error;
    } finally {
      this.connectionPromise = undefined;
    }
  }
}

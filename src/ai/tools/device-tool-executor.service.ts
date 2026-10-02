import { Injectable, Logger } from '@nestjs/common';
import type { CallToolResult } from '@modelcontextprotocol/client';

import {
  GeminiFunctionCall,
  GeminiFunctionResult,
} from '../gemini/gemini.types.js';
import { McpDeviceClientService } from '../mcp/mcp-device-client.service.js';
import { DEVICE_TOOL_NAMES } from './device-tools.js';

@Injectable()
export class DeviceToolExecutorService {
  private readonly logger = new Logger(DeviceToolExecutorService.name);

  constructor(private readonly mcpClient: McpDeviceClientService) {}

  async execute(call: GeminiFunctionCall): Promise<GeminiFunctionResult> {
    this.logger.debug(`Executing AI tool "${call.name}"`);

    try {
      this.assertSupportedTool(call.name);

      const mcpResult = await this.mcpClient.callTool(
        call.name,
        call.arguments,
      );

      if (mcpResult.isError === true) {
        throw new Error(
          `MCP tool "${call.name}" failed: ${this.readMcpError(mcpResult)}`,
        );
      }

      return {
        callId: call.id,
        name: call.name,
        result: this.readStructuredContent(call.name, mcpResult),
      };
    } catch (error) {
      this.logger.error(
        `AI tool "${call.name}" failed`,
        error instanceof Error ? error.stack : undefined,
      );

      throw error;
    }
  }

  private assertSupportedTool(name: string): void {
    switch (name) {
      case DEVICE_TOOL_NAMES.GET_DEVICE:
      case DEVICE_TOOL_NAMES.GET_LATEST_TELEMETRY:
      case DEVICE_TOOL_NAMES.GET_RECENT_EVENTS:
        return;
      default:
        throw new Error(`Unknown AI tool "${name}"`);
    }
  }

  private readStructuredContent(
    toolName: string,
    result: CallToolResult,
  ): Record<string, unknown> {
    const structuredContent = result.structuredContent;

    if (!this.isRecord(structuredContent)) {
      throw new Error(
        `MCP tool "${toolName}" returned invalid structured content`,
      );
    }

    return structuredContent;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private readMcpError(result: CallToolResult): string {
    const message = result.content
      .filter((content) => content.type === 'text')
      .map((content) => content.text.trim())
      .filter((text) => text.length > 0)
      .join(' ');

    return message || 'MCP returned an error result';
  }
}

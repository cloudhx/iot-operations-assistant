import { Injectable } from '@nestjs/common';
import type { Tool } from '@modelcontextprotocol/client';

import type { GeminiFunctionTool } from '../gemini/gemini.types.js';
import {
  DEVICE_TOOL_NAMES,
  type DeviceToolName,
} from '../tools/device-tools.js';
import { McpDeviceClientService } from './mcp-device-client.service.js';

const REQUIRED_DEVICE_TOOL_NAMES: readonly DeviceToolName[] =
  Object.values(DEVICE_TOOL_NAMES);

const IGNORABLE_SCHEMA_METADATA = new Set([
  '$schema',
  'title',
  'examples',
  'default',
]);

type GeminiProperty = GeminiFunctionTool['parameters']['properties'][string];

@Injectable()
export class McpGeminiToolAdapterService {
  constructor(private readonly mcpClient: McpDeviceClientService) {}

  async getGeminiDeviceTools(): Promise<GeminiFunctionTool[]> {
    const discoveredTools = await this.mcpClient.listTools();
    const deviceTools = this.selectRequiredDeviceTools(discoveredTools);

    return deviceTools.map((tool) => this.toGeminiFunctionTool(tool));
  }

  private selectRequiredDeviceTools(discoveredTools: readonly Tool[]): Tool[] {
    const deviceToolsByName = new Map<DeviceToolName, Tool>();

    for (const discoveredTool of discoveredTools) {
      if (!this.isDeviceToolName(discoveredTool.name)) {
        continue;
      }

      if (deviceToolsByName.has(discoveredTool.name)) {
        throw new Error(
          `MCP server returned duplicate tool "${discoveredTool.name}"`,
        );
      }

      deviceToolsByName.set(discoveredTool.name, discoveredTool);
    }

    return REQUIRED_DEVICE_TOOL_NAMES.map((name) => {
      const tool = deviceToolsByName.get(name);

      if (!tool) {
        throw new Error(`MCP server is missing required READ tool "${name}"`);
      }

      return tool;
    });
  }

  private toGeminiFunctionTool(tool: Tool): GeminiFunctionTool {
    const description = tool.description?.trim();

    if (!description) {
      throw new Error(
        `MCP tool "${tool.name}" requires a non-empty description for Gemini`,
      );
    }

    const schema = tool.inputSchema;
    this.assertSupportedSchemaKeywords(
      tool.name,
      'input schema',
      schema,
      new Set(['type', 'properties', 'required', 'additionalProperties']),
    );

    if (
      schema.additionalProperties !== undefined &&
      schema.additionalProperties !== false
    ) {
      throw new Error(
        `MCP tool "${tool.name}" input schema has unsupported additionalProperties`,
      );
    }

    const properties: GeminiFunctionTool['parameters']['properties'] = {};

    for (const [propertyName, propertySchema] of Object.entries(
      schema.properties ?? {},
    )) {
      properties[propertyName] = this.toGeminiProperty(
        tool.name,
        propertyName,
        propertySchema,
      );
    }

    const required = schema.required ?? [];

    for (const requiredProperty of required) {
      if (!(requiredProperty in properties)) {
        throw new Error(
          `MCP tool "${tool.name}" requires undefined property "${requiredProperty}"`,
        );
      }
    }

    return {
      type: 'function',
      name: tool.name,
      description,
      parameters: {
        type: 'object',
        properties,
        required: [...required],
        additionalProperties: false,
      },
    };
  }

  private toGeminiProperty(
    toolName: string,
    propertyName: string,
    schema: unknown,
  ): GeminiProperty {
    if (!this.isRecord(schema)) {
      throw new Error(
        `MCP tool "${toolName}" property "${propertyName}" uses an unsupported schema`,
      );
    }

    const description = schema.description;

    if (typeof description !== 'string' || description.trim().length === 0) {
      throw new Error(
        `MCP tool "${toolName}" property "${propertyName}" requires a non-empty description`,
      );
    }

    if (schema.type === 'string') {
      this.assertSupportedSchemaKeywords(
        toolName,
        `property "${propertyName}"`,
        schema,
        new Set(['type', 'description', 'minLength']),
      );

      const { minLength } = schema;

      if (
        minLength !== undefined &&
        (typeof minLength !== 'number' ||
          !Number.isInteger(minLength) ||
          minLength < 0)
      ) {
        throw new Error(
          `MCP tool "${toolName}" property "${propertyName}" has invalid minLength`,
        );
      }

      return {
        type: 'string',
        description,
        ...(minLength === undefined ? {} : { minLength }),
      };
    }

    if (schema.type === 'integer') {
      this.assertSupportedSchemaKeywords(
        toolName,
        `property "${propertyName}"`,
        schema,
        new Set(['type', 'description', 'minimum', 'maximum']),
      );

      const { minimum, maximum } = schema;

      if (
        minimum !== undefined &&
        (typeof minimum !== 'number' || !Number.isFinite(minimum))
      ) {
        throw new Error(
          `MCP tool "${toolName}" property "${propertyName}" has invalid minimum`,
        );
      }

      if (
        maximum !== undefined &&
        (typeof maximum !== 'number' || !Number.isFinite(maximum))
      ) {
        throw new Error(
          `MCP tool "${toolName}" property "${propertyName}" has invalid maximum`,
        );
      }

      return {
        type: 'integer',
        description,
        ...(minimum === undefined ? {} : { minimum }),
        ...(maximum === undefined ? {} : { maximum }),
      };
    }

    throw new Error(
      `MCP tool "${toolName}" property "${propertyName}" uses an unsupported schema`,
    );
  }

  private assertSupportedSchemaKeywords(
    toolName: string,
    location: string,
    value: Record<string, unknown>,
    supportedKeywords: ReadonlySet<string>,
  ): void {
    const unsupportedKeyword = Object.keys(value).find(
      (keyword) =>
        !supportedKeywords.has(keyword) &&
        !IGNORABLE_SCHEMA_METADATA.has(keyword),
    );

    if (unsupportedKeyword) {
      throw new Error(
        `MCP tool "${toolName}" ${location} uses unsupported keyword "${unsupportedKeyword}"`,
      );
    }
  }

  private isDeviceToolName(name: string): name is DeviceToolName {
    return REQUIRED_DEVICE_TOOL_NAMES.some(
      (requiredName) => requiredName === name,
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}

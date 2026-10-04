import { Test } from '@nestjs/testing';

import { DeviceAssistantService } from './device-assistant.service.js';
import { GeminiClientService } from './gemini/gemini-client.service.js';
import type { GeminiFunctionTool, GeminiTurn } from './gemini/gemini.types.js';
import { McpGeminiToolAdapterService } from './mcp/mcp-gemini-tool-adapter.service.js';
import { AiTraceService } from './observability/ai-trace.service.js';
import { DeviceAssistantToolDispatcherService } from './tools/device-assistant-tool-dispatcher.service.js';
import { DEVICE_TOOL_NAMES } from './tools/device-tools.js';
import { SEARCH_MAINTENANCE_KNOWLEDGE_TOOL_NAME } from './tools/maintenance-knowledge.tool.js';
import { CREATE_MAINTENANCE_WORK_ORDER_TOOL_NAME } from './tools/maintenance-work-order.tool.js';

const readTools: GeminiFunctionTool[] = Object.values(DEVICE_TOOL_NAMES).map(
  (name) => ({
    type: 'function',
    name,
    description: `Discovered ${name}`,
    parameters: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  }),
);

describe('DeviceAssistantService tool composition', () => {
  it('combines discovered READ tools with static retrieval and action tools', async () => {
    const completedTurn: GeminiTurn = {
      id: 'interaction-001',
      outputText: 'No tool call was needed.',
      functionCalls: [],
    };
    const startInteraction = vi.fn(
      async (
        _input: string,
        _tools: GeminiFunctionTool[],
        _systemInstruction: string,
      ): Promise<GeminiTurn> => completedTurn,
    );
    const getGeminiDeviceTools = vi.fn(
      async (): Promise<GeminiFunctionTool[]> => readTools,
    );
    const module = await Test.createTestingModule({
      providers: [
        DeviceAssistantService,
        AiTraceService,
        {
          provide: GeminiClientService,
          useValue: {
            startInteraction,
            continueWithFunctionResults: vi.fn(),
          },
        },
        {
          provide: McpGeminiToolAdapterService,
          useValue: { getGeminiDeviceTools },
        },
        {
          provide: DeviceAssistantToolDispatcherService,
          useValue: { execute: vi.fn() },
        },
      ],
    }).compile();

    try {
      const assistant = module.get(DeviceAssistantService);

      await expect(assistant.askDeviceAssistant('Summarize it.')).resolves.toBe(
        completedTurn.outputText,
      );

      expect(getGeminiDeviceTools).toHaveBeenCalledOnce();
      expect(startInteraction).toHaveBeenCalledOnce();

      const tools = startInteraction.mock.calls[0][1];
      expect(tools).toHaveLength(5);
      expect(tools.map(({ name }) => name).sort()).toEqual(
        [
          ...Object.values(DEVICE_TOOL_NAMES),
          SEARCH_MAINTENANCE_KNOWLEDGE_TOOL_NAME,
          CREATE_MAINTENANCE_WORK_ORDER_TOOL_NAME,
        ].sort(),
      );
    } finally {
      await module.close();
    }
  });
});

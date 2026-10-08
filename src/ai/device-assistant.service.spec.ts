import { Test } from '@nestjs/testing';

import { DeviceAssistantInteractionError } from './device-assistant.contract.js';
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

describe('DeviceAssistantService', () => {
  it('returns the trace interaction ID with the answer and composes all tools', async () => {
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

      const result = await assistant.askDeviceAssistant('Summarize it.');
      expect(result).toEqual({
        interactionId: expect.any(String),
        answer: completedTurn.outputText,
      });
      expect(
        module.get(AiTraceService).findById(result.interactionId),
      ).toMatchObject({ interactionId: result.interactionId });

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

  it('records a failed trace and throws the same interaction ID', async () => {
    const internalFailure = new Error('MCP discovery failed');
    const traceService = new AiTraceService();
    const module = await Test.createTestingModule({
      providers: [
        DeviceAssistantService,
        { provide: AiTraceService, useValue: traceService },
        {
          provide: GeminiClientService,
          useValue: {
            startInteraction: vi.fn(),
            continueWithFunctionResults: vi.fn(),
          },
        },
        {
          provide: McpGeminiToolAdapterService,
          useValue: {
            getGeminiDeviceTools: vi.fn().mockRejectedValue(internalFailure),
          },
        },
        {
          provide: DeviceAssistantToolDispatcherService,
          useValue: { execute: vi.fn() },
        },
      ],
    }).compile();

    try {
      const assistant = module.get(DeviceAssistantService);
      let thrown: unknown;

      try {
        await assistant.askDeviceAssistant('Inspect the device.');
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(DeviceAssistantInteractionError);
      if (!(thrown instanceof DeviceAssistantInteractionError)) {
        throw new Error('Expected a correlated interaction error');
      }
      const interactionError = thrown;
      expect(interactionError.interactionId).toEqual(expect.any(String));
      expect(interactionError.cause).toBe(internalFailure);
      expect(
        traceService.findById(interactionError.interactionId),
      ).toMatchObject({
        interactionId: interactionError.interactionId,
        outcome: 'FAILED',
        failure: {
          stage: 'ORCHESTRATION',
          message: internalFailure.message,
        },
      });
    } finally {
      await module.close();
    }
  });

  it('rejects blank input before creating an interaction trace', async () => {
    const traceService = new AiTraceService();
    const module = await Test.createTestingModule({
      providers: [
        DeviceAssistantService,
        { provide: AiTraceService, useValue: traceService },
        { provide: GeminiClientService, useValue: {} },
        { provide: McpGeminiToolAdapterService, useValue: {} },
        { provide: DeviceAssistantToolDispatcherService, useValue: {} },
      ],
    }).compile();

    try {
      const assistant = module.get(DeviceAssistantService);

      await expect(assistant.askDeviceAssistant('   ')).rejects.toThrow(
        'Device assistant input must not be empty',
      );
      expect(traceService.findAll()).toEqual([]);
    } finally {
      await module.close();
    }
  });
});

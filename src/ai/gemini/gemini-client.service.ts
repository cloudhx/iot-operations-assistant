import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';

import {
  GeminiFunctionCall,
  GeminiFunctionResult,
  GeminiFunctionTool,
  GeminiTurn,
} from './gemini.types.js';

const GEMINI_MODEL = 'gemini-3.8-flash';

@Injectable()
export class GeminiClientService {
  private readonly logger = new Logger(GeminiClientService.name);
  private readonly client: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error(
        'GEMINI_API_KEY is required to initialize Gemini integration',
      );
    }

    this.client = new GoogleGenAI({ apiKey });
  }

  async startInteraction(
    input: string,
    tools: GeminiFunctionTool[],
    systemInstruction: string,
  ): Promise<GeminiTurn> {
    try {
      const interaction = await this.client.interactions.create({
        model: GEMINI_MODEL,
        input,
        tools,
        system_instruction: systemInstruction,
      });

      return this.toGeminiTurn(interaction);
    } catch (error) {
      this.logInteractionFailure(error);
      throw error;
    }
  }

  async continueWithFunctionResults(
    previousInteractionId: string,
    results: GeminiFunctionResult[],
    tools: GeminiFunctionTool[],
    systemInstruction: string,
  ): Promise<GeminiTurn> {
    try {
      const interaction = await this.client.interactions.create({
        model: GEMINI_MODEL,
        previous_interaction_id: previousInteractionId,
        tools,
        system_instruction: systemInstruction,
        input: results.map((result) => ({
          type: 'function_result' as const,
          name: result.name,
          call_id: result.callId,
          result: [
            {
              type: 'text' as const,
              text: JSON.stringify(result.result) ?? 'null',
            },
          ],
        })),
      });

      return this.toGeminiTurn(interaction);
    } catch (error) {
      this.logInteractionFailure(error);
      throw error;
    }
  }

  private toGeminiTurn(interaction: {
    id: string;
    output_text?: string;
    steps?: readonly unknown[];
  }): GeminiTurn {
    const functionCalls: GeminiFunctionCall[] = [];

    for (const step of interaction.steps ?? []) {
      if (this.isFunctionCallStep(step)) {
        functionCalls.push({
          id: step.id,
          name: step.name,
          arguments: step.arguments,
        });
      }
    }

    return {
      id: interaction.id,
      outputText: interaction.output_text ?? '',
      functionCalls,
    };
  }

  private isFunctionCallStep(step: unknown): step is {
    type: 'function_call';
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  } {
    if (
      typeof step !== 'object' ||
      step === null ||
      !('type' in step) ||
      step.type !== 'function_call'
    ) {
      return false;
    }

    return (
      'id' in step &&
      typeof step.id === 'string' &&
      'name' in step &&
      typeof step.name === 'string' &&
      'arguments' in step &&
      typeof step.arguments === 'object' &&
      step.arguments !== null &&
      !Array.isArray(step.arguments)
    );
  }

  private logInteractionFailure(error: unknown): void {
    this.logger.error(
      'Gemini interaction failed',
      error instanceof Error ? error.stack : undefined,
    );
  }
}

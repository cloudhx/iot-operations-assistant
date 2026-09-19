import { Logger } from '@nestjs/common';
import { type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../src/app.module.js';
import { DeviceAssistantService } from '../../../src/ai/device-assistant.service.js';
import { INTEGRATED_ASSISTANT_EVALUATION_CASES } from './device-assistant.integrated.evaluation-cases.js';

describe('Integrated Device Assistant evaluation', () => {
  let application: INestApplicationContext;
  let deviceAssistant: DeviceAssistantService;

  beforeAll(async () => {
    application = await NestFactory.createApplicationContext(AppModule, {
      logger: ['log', 'error', 'warn', 'debug'],
    });

    deviceAssistant = application.get(DeviceAssistantService);
  }, 30_000);

  afterAll(async () => {
    await application.close();
  });

  for (const evaluationCase of INTEGRATED_ASSISTANT_EVALUATION_CASES) {
    it(`${evaluationCase.id}: orchestrates the required capabilities`, async () => {
      Logger.log(`Question: ${evaluationCase.question}`, evaluationCase.id);

      Logger.log(
        `Probably required tools: ${
          evaluationCase.probablyRequiredTools.join(', ') || 'none'
        }`,
        evaluationCase.id,
      );

      Logger.log(
        `Optional tools: ${evaluationCase.optionalTools.join(', ') || 'none'}`,
        evaluationCase.id,
      );

      Logger.log(
        `Probably unnecessary tools: ${
          evaluationCase.probablyUnnecessaryTools.join(', ') || 'none'
        }`,
        evaluationCase.id,
      );

      const answer = await deviceAssistant.askDeviceAssistant(
        evaluationCase.question,
      );

      Logger.log(`Final answer:\n${answer}`, evaluationCase.id);

      Logger.log(
        [
          'Expected answer characteristics:',
          ...evaluationCase.expectedAnswerCharacteristics.map(
            (item) => `- ${item}`,
          ),
        ].join('\n'),
        evaluationCase.id,
      );

      Logger.log(
        [
          'Failure indicators:',
          ...evaluationCase.failureIndicators.map((item) => `- ${item}`),
        ].join('\n'),
        evaluationCase.id,
      );

      expect(answer.trim().length).toBeGreaterThan(0);
    }, 120_000);
  }
});

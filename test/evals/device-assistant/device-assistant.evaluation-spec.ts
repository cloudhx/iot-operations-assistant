import { INestApplicationContext, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DeviceAssistantService } from '../../../src/ai/device-assistant.service.js';
import { AppModule } from '../../../src/app.module.js';
import { DEVICE_ASSISTANT_EVALUATION_CASES } from './device-assistant.evaluation-cases.js';

describe('Device Assistant evaluation baseline', () => {
  const logger = new Logger('DeviceAssistantEvaluation');

  let applicationContext: INestApplicationContext;
  let deviceAssistant: DeviceAssistantService;

  beforeAll(async () => {
    applicationContext = await NestFactory.createApplicationContext(AppModule, {
      logger: ['log', 'error', 'warn', 'debug'],
    });

    deviceAssistant = applicationContext.get(DeviceAssistantService);
  });

  afterAll(async () => {
    await applicationContext?.close();
  });

  for (const evaluationCase of DEVICE_ASSISTANT_EVALUATION_CASES) {
    it(`${evaluationCase.id}: ${evaluationCase.purpose}`, async () => {
      logger.log('');
      logger.log('='.repeat(72));
      logger.log(`${evaluationCase.id}: ${evaluationCase.purpose}`);
      logger.log(`Prompt: ${evaluationCase.prompt}`);
      logger.log('='.repeat(72));

      const answer = await deviceAssistant.askDeviceAssistant(
        evaluationCase.prompt,
      );

      logger.log(`Final answer for ${evaluationCase.id}:`);
      console.log(answer);
      console.log();

      expect(answer.trim().length).toBeGreaterThan(0);
    }, 180_000);
  }
});

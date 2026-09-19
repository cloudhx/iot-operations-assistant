import { INestApplicationContext, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { DeviceAssistantService } from '../../../src/ai/device-assistant.service.js';
import { AppModule } from '../../../src/app.module.js';

const logger = new Logger('TestDeviceAssistant');

const TEST_PROMPT =
  'What is going on with device vibration-sensor-001? Use the available device data to explain any noteworthy recent measurements or events.';

describe('Device Assistant integration', () => {
  it('executes the complete Gemini function-calling flow', async () => {
    let applicationContext: INestApplicationContext | undefined;

    try {
      applicationContext = await NestFactory.createApplicationContext(
        AppModule,
        {
          logger: ['log', 'error', 'warn', 'debug'],
        },
      );

      const deviceAssistant = applicationContext.get(DeviceAssistantService);

      logger.log(`Input prompt: ${TEST_PROMPT}`);

      const answer = await deviceAssistant.askDeviceAssistant(TEST_PROMPT);

      logger.log('Final Gemini answer:');
      console.log(answer);

      expect(answer.trim().length).toBeGreaterThan(0);
    } catch (error) {
      logger.error(
        'Device Assistant invocation failed',
        error instanceof Error ? error.stack : String(error),
      );

      throw error;
    } finally {
      if (applicationContext) {
        await applicationContext.close();
        logger.debug('Nest application context closed');
      }
    }
  }, 60_000);
});

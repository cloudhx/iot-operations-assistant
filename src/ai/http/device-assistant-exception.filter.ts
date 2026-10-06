import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

import { DeviceAssistantInteractionError } from '../device-assistant.contract.js';

@Catch(DeviceAssistantInteractionError)
export class DeviceAssistantExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DeviceAssistantExceptionFilter.name);

  catch(exception: DeviceAssistantInteractionError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const cause = exception.cause;

    this.logger.error(
      `Device assistant interaction "${exception.interactionId}" failed`,
      cause instanceof Error ? cause.stack : String(cause),
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'AI_INTERACTION_FAILED',
      message: 'The assistant could not complete the request.',
      interactionId: exception.interactionId,
    });
  }
}

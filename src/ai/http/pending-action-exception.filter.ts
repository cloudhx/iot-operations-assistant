import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

import {
  PendingActionNotFoundError,
  PendingActionStateConflictError,
} from '../actions/pending-action.errors.js';
import type { PendingActionErrorResponseDto } from './pending-action-error-response.dto.js';

@Catch(PendingActionNotFoundError, PendingActionStateConflictError)
export class PendingActionExceptionFilter implements ExceptionFilter {
  catch(
    exception: PendingActionNotFoundError | PendingActionStateConflictError,
    host: ArgumentsHost,
  ): void {
    const notFound = exception instanceof PendingActionNotFoundError;
    const body: PendingActionErrorResponseDto = {
      statusCode: notFound ? HttpStatus.NOT_FOUND : HttpStatus.CONFLICT,
      error: notFound
        ? 'PENDING_ACTION_NOT_FOUND'
        : 'PENDING_ACTION_STATE_CONFLICT',
      message: notFound
        ? 'The pending action was not found.'
        : 'The pending action does not allow this decision in its current state.',
      actionId: exception.actionId,
    };

    host
      .switchToHttp()
      .getResponse<Response>()
      .status(body.statusCode)
      .json(body);
  }
}

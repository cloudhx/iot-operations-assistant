import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

import {
  PendingActionAuthorizationDeniedError,
  PendingActionAuthorizationUnavailableError,
  PendingActionNotFoundError,
  PendingActionStateConflictError,
} from '../actions/pending-action.errors.js';
import type { PendingActionErrorResponseDto } from './pending-action-error-response.dto.js';

@Catch(
  PendingActionNotFoundError,
  PendingActionStateConflictError,
  PendingActionAuthorizationDeniedError,
  PendingActionAuthorizationUnavailableError,
)
export class PendingActionExceptionFilter implements ExceptionFilter {
  catch(
    exception:
      | PendingActionNotFoundError
      | PendingActionStateConflictError
      | PendingActionAuthorizationDeniedError
      | PendingActionAuthorizationUnavailableError,
    host: ArgumentsHost,
  ): void {
    const notFound = exception instanceof PendingActionNotFoundError;
    const denied = exception instanceof PendingActionAuthorizationDeniedError;
    const unavailable =
      exception instanceof PendingActionAuthorizationUnavailableError;
    const body: PendingActionErrorResponseDto = {
      statusCode: notFound
        ? HttpStatus.NOT_FOUND
        : denied
          ? HttpStatus.FORBIDDEN
          : unavailable
            ? HttpStatus.SERVICE_UNAVAILABLE
            : HttpStatus.CONFLICT,
      error: notFound
        ? 'PENDING_ACTION_NOT_FOUND'
        : denied
          ? 'PENDING_ACTION_AUTHORIZATION_DENIED'
          : unavailable
            ? 'PENDING_ACTION_AUTHORIZATION_UNAVAILABLE'
            : 'PENDING_ACTION_STATE_CONFLICT',
      message: notFound
        ? 'The pending action was not found.'
        : denied
          ? 'You are not allowed to make this pending action decision.'
          : unavailable
            ? 'Authorization is temporarily unavailable. Please try again later.'
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

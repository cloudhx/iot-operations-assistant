import { AuthGuard, type AuthenticatedRequest } from '../../auth/auth.guard.js';
import {
  Body,
  Req,
  UseGuards,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseFilters,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCookieAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiServiceUnavailableResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { PendingActionNotFoundError } from '../actions/pending-action.errors.js';
import { PendingActionDecisionService } from '../actions/pending-action-decision.service.js';
import { PendingActionsService } from '../actions/pending-actions.service.js';
import { PendingActionDecisionRequestDto } from './pending-action-decision-request.dto.js';
import { PendingActionErrorResponseDto } from './pending-action-error-response.dto.js';
import { PendingActionExceptionFilter } from './pending-action-exception.filter.js';
import {
  PendingActionResponseDto,
  toPendingActionResponse,
} from './pending-action-response.dto.js';

@ApiTags('Pending actions')
@ApiParam({ name: 'id', type: String, description: 'The proposed action ID.' })
@ApiNotFoundResponse({
  description: 'Unknown pending action.',
  type: PendingActionErrorResponseDto,
})
@Controller('ai/pending-actions')
@UseFilters(PendingActionExceptionFilter)
export class PendingActionsController {
  constructor(
    private readonly pendingActions: PendingActionsService,
    private readonly decisions: PendingActionDecisionService,
  ) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Review a proposed action and its frozen arguments',
  })
  @ApiOkResponse({ type: PendingActionResponseDto })
  find(@Param('id') id: string): PendingActionResponseDto {
    const action = this.pendingActions.findById(id);
    if (!action) throw new PendingActionNotFoundError(id);
    return toPendingActionResponse(action);
  }

  @Post(':id/approve')
  @UseGuards(AuthGuard)
  @ApiCookieAuth('session')
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse({ type: PendingActionErrorResponseDto })
  @ApiServiceUnavailableResponse({ type: PendingActionErrorResponseDto })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve and execute the stored frozen action' })
  @ApiBody({
    required: false,
    schema: { type: 'object', additionalProperties: false },
  })
  @ApiOkResponse({
    description:
      'Completed action; duplicate approval returns its existing result.',
    type: PendingActionResponseDto,
  })
  @ApiConflictResponse({
    description: 'The current state does not allow approval.',
    type: PendingActionErrorResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Decision bodies must be empty.' })
  async approve(
    @Param('id') id: string,
    @Body() _request: PendingActionDecisionRequestDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<PendingActionResponseDto> {
    const result = await this.decisions.approvePendingAction(
      id,
      request.principal,
    );
    return toPendingActionResponse(result.action);
  }

  @Post(':id/reject')
  @UseGuards(AuthGuard)
  @ApiCookieAuth('session')
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse({ type: PendingActionErrorResponseDto })
  @ApiServiceUnavailableResponse({ type: PendingActionErrorResponseDto })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a pending action without execution' })
  @ApiBody({
    required: false,
    schema: { type: 'object', additionalProperties: false },
  })
  @ApiOkResponse({ type: PendingActionResponseDto })
  @ApiConflictResponse({
    description: 'The current state does not allow rejection.',
    type: PendingActionErrorResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Decision bodies must be empty.' })
  async reject(
    @Param('id') id: string,
    @Body() _request: PendingActionDecisionRequestDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<PendingActionResponseDto> {
    return toPendingActionResponse(
      await this.decisions.rejectPendingAction(id, request.principal),
    );
  }
}

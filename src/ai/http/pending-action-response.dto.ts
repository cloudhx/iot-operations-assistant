import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  PENDING_ACTION_STATUSES,
  type PendingAction,
  type PendingActionStatus,
} from '../actions/pending-action.model.js';

export class PendingActionArgumentsDto {
  @ApiProperty({ type: String })
  deviceId!: string;

  @ApiPropertyOptional({ type: String })
  component?: string;

  @ApiProperty({ type: String })
  reason!: string;
}

export class PendingActionWorkOrderResultDto extends PendingActionArgumentsDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ enum: ['OPEN'] })
  status!: 'OPEN';

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

export class PendingActionResponseDto {
  @ApiProperty({ type: String, example: 'pending-action-001' })
  id!: string;

  @ApiProperty({ enum: ['create_maintenance_work_order'] })
  toolName!: 'create_maintenance_work_order';

  @ApiProperty({ enum: Object.values(PENDING_ACTION_STATUSES) })
  status!: PendingActionStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: PendingActionArgumentsDto })
  arguments!: PendingActionArgumentsDto;

  @ApiPropertyOptional({
    type: PendingActionWorkOrderResultDto,
    description: 'The stored execution result, present after completion.',
  })
  result?: PendingActionWorkOrderResultDto;
}

export function toPendingActionResponse(
  action: PendingAction,
): PendingActionResponseDto {
  return {
    id: action.id,
    toolName: action.toolName,
    status: action.status,
    createdAt: action.createdAt.toISOString(),
    arguments: {
      deviceId: action.arguments.deviceId,
      reason: action.arguments.reason,
      ...(action.arguments.component !== undefined
        ? { component: action.arguments.component }
        : {}),
    },
    ...(action.status === PENDING_ACTION_STATUSES.COMPLETED && action.result
      ? {
          result: {
            id: action.result.id,
            deviceId: action.result.deviceId,
            reason: action.result.reason,
            ...(action.result.component !== undefined
              ? { component: action.result.component }
              : {}),
            status: action.result.status,
            createdAt: action.result.createdAt.toISOString(),
          },
        }
      : {}),
  };
}

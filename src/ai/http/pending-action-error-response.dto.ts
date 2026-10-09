import { ApiProperty } from '@nestjs/swagger';

export class PendingActionErrorResponseDto {
  @ApiProperty({ enum: [403, 404, 409, 503] })
  statusCode!: number;

  @ApiProperty({
    enum: [
      'PENDING_ACTION_NOT_FOUND',
      'PENDING_ACTION_STATE_CONFLICT',
      'PENDING_ACTION_AUTHORIZATION_DENIED',
      'PENDING_ACTION_AUTHORIZATION_UNAVAILABLE',
    ],
  })
  error!: string;

  @ApiProperty({
    type: String,
    description: 'A sanitized application failure message.',
  })
  message!: string;

  @ApiProperty({ type: String })
  actionId!: string;
}

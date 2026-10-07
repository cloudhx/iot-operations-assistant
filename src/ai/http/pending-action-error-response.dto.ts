import { ApiProperty } from '@nestjs/swagger';

export class PendingActionErrorResponseDto {
  @ApiProperty({ enum: [404, 409] })
  statusCode!: number;

  @ApiProperty({
    enum: ['PENDING_ACTION_NOT_FOUND', 'PENDING_ACTION_STATE_CONFLICT'],
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

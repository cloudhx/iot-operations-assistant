import { ApiProperty } from '@nestjs/swagger';

export class DeviceAssistantErrorResponseDto {
  @ApiProperty({ type: Number, enum: [500], example: 500 })
  statusCode!: number;

  @ApiProperty({
    type: String,
    enum: ['AI_INTERACTION_FAILED'],
    example: 'AI_INTERACTION_FAILED',
  })
  error!: string;

  @ApiProperty({
    type: String,
    example: 'The assistant could not complete the request.',
    description: 'Sanitized failure message without internal error details.',
  })
  message!: string;

  @ApiProperty({
    type: String,
    description: 'Unique interaction ID shared with the failed trace and logs.',
    example: 'ai-123e4567-e89b-42d3-a456-426614174000',
  })
  interactionId!: string;
}

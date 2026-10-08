import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuthenticatedPrincipalDto {
  @ApiProperty({ type: String })
  id!: string;
  @ApiPropertyOptional({ type: String })
  email?: string;
  @ApiPropertyOptional({ type: String })
  displayName?: string;
}

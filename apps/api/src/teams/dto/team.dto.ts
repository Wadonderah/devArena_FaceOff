import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateTeamDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  @Transform(trim)
  name!: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(300)
  avatarUrl?: string;
}

export class JoinTeamDto {
  @IsString()
  @MinLength(4)
  @MaxLength(16)
  code!: string;
}

export class TransferCaptaincyDto {
  @IsString()
  @MaxLength(64)
  userId!: string;
}

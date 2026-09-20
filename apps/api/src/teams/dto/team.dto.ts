import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, IsUrl, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateTeamDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  @Transform(trim)
  name!: string;

  // https only: the value will eventually be an <img src>, and the default
  // allows ftp: and http:. Not rendered anywhere yet — bounded now so the first
  // screen to render it inherits a safe value.
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
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
  // The column is @db.Uuid; a non-UUID string reached Postgres and surfaced
  // as a 500 instead of a 400.
  @IsUUID()
  userId!: string;
}

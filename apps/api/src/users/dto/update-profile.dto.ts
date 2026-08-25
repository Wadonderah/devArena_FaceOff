import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  @Transform(trim)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(trim)
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Transform(trim)
  country?: string;

  @IsOptional()
  @IsUrl({ host_whitelist: ['github.com', 'www.github.com'] })
  @MaxLength(200)
  githubUrl?: string;
}

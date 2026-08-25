import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CompetitionState } from '@prisma/client';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateCompetitionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  @Transform(trim)
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Slug must be lowercase words separated by single hyphens',
  })
  @MaxLength(80)
  @Transform(trim)
  slug!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(trim)
  description?: string;

  @IsOptional()
  @IsDateString()
  registrationOpensAt?: string;

  @IsOptional()
  @IsDateString()
  registrationClosesAt?: string;
}

export class UpdateCompetitionDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  @Transform(trim)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(trim)
  description?: string;

  @IsOptional()
  @IsEnum(CompetitionState)
  state?: CompetitionState;

  @IsOptional()
  @IsDateString()
  registrationOpensAt?: string;

  @IsOptional()
  @IsDateString()
  registrationClosesAt?: string;
}

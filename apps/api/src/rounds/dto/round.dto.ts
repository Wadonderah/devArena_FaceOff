import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Language, ParticipationMode, RevealMode, RoundType } from '@prisma/client';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateRoundDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  @Transform(trim)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(trim)
  description?: string;

  @IsEnum(RoundType)
  type!: RoundType;

  @IsInt()
  @Min(0)
  @Max(50)
  orderIndex!: number;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1)
  weight!: number;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(Language, { each: true })
  allowedLanguages?: Language[];

  @IsOptional()
  @IsEnum(RevealMode)
  revealMode?: RevealMode;

  @IsOptional()
  @IsEnum(ParticipationMode)
  participationMode?: ParticipationMode;

  /// Null means unlimited, which is how every round behaved before this existed.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  attemptLimit?: number;

  /// Points deducted per wrong MCQ answer. gradeMcq() clamps the deduction to the
  /// question's own value, so this can never cost more than the question was worth.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  negativeMarking?: number;

}

export class UpdateRoundDto {
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
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1)
  weight?: number;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(Language, { each: true })
  allowedLanguages?: Language[];

  @IsOptional()
  @IsEnum(RevealMode)
  revealMode?: RevealMode;

  @IsOptional()
  @IsEnum(ParticipationMode)
  participationMode?: ParticipationMode;

  /// Null means unlimited, which is how every round behaved before this existed.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  attemptLimit?: number;

  /// Points deducted per wrong MCQ answer. gradeMcq() clamps the deduction to the
  /// question's own value, so this can never cost more than the question was worth.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  negativeMarking?: number;

}

export class SetRoundChallengesDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @Type(() => String)
  challengeIds!: string[];
}

import { IsEnum, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { Language } from '@prisma/client';

// 64 KB. Large enough for any legitimate solution, small enough that a flood of
// oversized payloads cannot be used to exhaust the queue or the database.
const SOURCE_MAX = 64 * 1024;

export class SubmitCodeDto {
  @IsUUID()
  roundId!: string;

  @IsUUID()
  challengeId!: string;

  @IsEnum(Language)
  language!: Language;

  @IsString()
  @MinLength(1)
  @MaxLength(SOURCE_MAX, { message: 'Your solution exceeds the 64 KB limit' })
  sourceCode!: string;
}

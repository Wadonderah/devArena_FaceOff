import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsObject,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Category, Difficulty } from '@prisma/client';
import { ValidateLanguageMap } from '../../common/validators/language-map.validator';
import { ValidateContextFiles } from '../../common/validators/context-files.validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class MCQOptionDto {
  @IsIn(['A', 'B', 'C', 'D'])
  label!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @Transform(trim)
  text!: string;

  @IsBoolean()
  isCorrect!: boolean;
}

export class CreateMCQChallengeDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  @Transform(trim)
  title!: string;

  @IsEnum(Category)
  category!: Category;

  @IsEnum(Difficulty)
  difficulty!: Difficulty;

  @IsInt()
  @Min(1)
  @Max(1000)
  points!: number;

  @IsString()
  @MinLength(5)
  @MaxLength(4000)
  prompt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  codeSnippet?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  explanation?: string;

  @IsArray()
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => MCQOptionDto)
  options!: MCQOptionDto[];
}

export class TestCaseDto {
  @IsString()
  @MaxLength(20000)
  stdin!: string;

  @IsString()
  @MaxLength(20000)
  expectedOutput!: string;

  @IsBoolean()
  isHidden!: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  weight?: number;
}

export class CreateCodingChallengeDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  @Transform(trim)
  title!: string;

  @IsEnum(Category)
  category!: Category;

  @IsEnum(Difficulty)
  difficulty!: Difficulty;

  @IsInt()
  @Min(1)
  @Max(1000)
  points!: number;

  @IsString()
  @MinLength(10)
  @MaxLength(20000)
  statement!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  constraints?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  inputFormat?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  outputFormat?: string;

  /// Starter code keyed by Language: { "PYTHON": "...", "JAVA": "..." }.
  /// Replaces the two fixed columns, which stopped scaling at eight languages.
  @IsOptional()
  @IsObject()
  @ValidateLanguageMap()
  starterCode?: Record<string, string>;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.5)
  @Max(15)
  cpuTimeLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(16000)
  @Max(512000)
  memoryLimitKb?: number;

  // Judge0 CE 1.13 advertises max_file_size = 1024 KB via /config_info; asking
  // for more is rejected at submission time.
  @IsOptional()
  @IsInt()
  @Min(256)
  @Max(1024)
  maxFileSizeKb?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TestCaseDto)
  testCases!: TestCaseDto[];
}

export class PublishChallengeDto {
  @IsBoolean()
  isPublished!: boolean;
}

export class CreateDebuggingChallengeDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  @Transform(trim)
  title!: string;

  @IsEnum(Category)
  category!: Category;

  @IsEnum(Difficulty)
  difficulty!: Difficulty;

  @IsInt()
  @Min(1)
  @Max(1000)
  points!: number;

  /// The symptom, as someone would actually report it. This is what the
  /// participant reads first, and what makes the task debugging rather than
  /// "implement this".
  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  bugReport!: string;

  /// Verbatim failing output — the evidence the code is broken. Required: a
  /// debugging challenge without it is just a coding challenge.
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  failingTestOutput!: string;

  /// Broken code keyed by Language. At least one entry, or there is nothing to fix.
  @IsObject()
  @ValidateLanguageMap()
  brokenCode!: Record<string, string>;

  /// Optional read-only supporting files, keyed by filename.
  @IsOptional()
  @IsObject()
  @ValidateContextFiles()
  contextFiles?: Record<string, string>;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.5)
  @Max(15)
  cpuTimeLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(16000)
  @Max(512000)
  memoryLimitKb?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TestCaseDto)
  testCases!: TestCaseDto[];
}

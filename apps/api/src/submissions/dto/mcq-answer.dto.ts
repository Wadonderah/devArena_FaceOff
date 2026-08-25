import { IsUUID } from 'class-validator';

export class SubmitMcqAnswerDto {
  @IsUUID()
  roundId!: string;

  @IsUUID()
  challengeId!: string;

  @IsUUID()
  optionId!: string;
}

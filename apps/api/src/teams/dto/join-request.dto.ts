import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RequestToJoinDto {
  /// A note to the captain. Optional, and shown to them verbatim, so it is
  /// length-bounded like any other participant-authored text.
  @IsOptional()
  @IsString()
  @MaxLength(280)
  message?: string;
}

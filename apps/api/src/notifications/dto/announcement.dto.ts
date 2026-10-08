import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class CreateAnnouncementDto {
  @IsString()
  @Length(3, 120)
  title!: string;

  @IsString()
  @Length(3, 2000)
  body!: string;

  /// Omit to reach every account, which requires SUPER_ADMIN. Present, and the
  /// announcement goes only to that competition's participants.
  @IsOptional()
  @IsUUID()
  competitionId?: string;
}

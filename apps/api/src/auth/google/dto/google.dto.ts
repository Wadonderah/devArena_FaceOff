import { IsString, Length } from 'class-validator';

export class ExchangeCodeDto {
  /// 32 random bytes, base64url — 43 characters. Bounded so a huge body cannot
  /// reach the hash function.
  @IsString()
  @Length(20, 200)
  code!: string;
}

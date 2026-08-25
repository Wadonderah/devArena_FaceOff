import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

// bcrypt silently ignores input past 72 bytes, so the maximum is enforced here
// rather than letting a longer password appear stronger than it is.
const PASSWORD_MAX = 72;

class PasswordField {
  @IsString()
  @MinLength(10, { message: 'Password must be at least 10 characters' })
  @MaxLength(PASSWORD_MAX, { message: `Password must be at most ${PASSWORD_MAX} characters` })
  @Matches(/[a-zA-Z]/, { message: 'Password must contain a letter' })
  @Matches(/[0-9]/, { message: 'Password must contain a number' })
  password!: string;
}

export class RegisterDto extends PasswordField {
  @IsEmail({}, { message: 'A valid email address is required' })
  @MaxLength(254)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  displayName!: string;
}

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

  @IsString()
  @MaxLength(PASSWORD_MAX)
  password!: string;
}

export class VerifyEmailDto {
  @IsString()
  @MaxLength(256)
  token!: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;
}

export class ResetPasswordDto extends PasswordField {
  @IsString()
  @MaxLength(256)
  token!: string;
}

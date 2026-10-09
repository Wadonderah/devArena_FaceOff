import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleController } from './google/google.controller';
import { GoogleOAuthService } from './google/google-oauth.service';
import { GoogleSignInService } from './google/google-sign-in.service';

@Module({
  imports: [PassportModule.register({ session: false }), JwtModule.register({})],
  // GoogleController is registered unconditionally and reports its own
  // availability instead, which is what lets a deployment with no credentials
  // boot normally: `GET /auth/providers` answers `{ google: false }` and the
  // two flow routes 404. A conditionally-registered provider — the usual
  // passport arrangement — would mean the module graph itself differs between
  // environments, so a wiring mistake would only ever surface in the one that
  // has credentials.
  controllers: [AuthController, GoogleController],
  providers: [AuthService, TokenService, JwtStrategy, GoogleOAuthService, GoogleSignInService],
  exports: [AuthService, TokenService],
})
export class AuthModule {}

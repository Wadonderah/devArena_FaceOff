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
  // Registered unconditionally and reports its own availability, so the module
  // graph is identical everywhere — a conditional provider would hide wiring
  // mistakes on deployments without credentials.
  controllers: [AuthController, GoogleController],
  providers: [AuthService, TokenService, JwtStrategy, GoogleOAuthService, GoogleSignInService],
  exports: [AuthService, TokenService],
})
export class AuthModule {}

import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { MailModule } from './mail/mail.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CompetitionsModule } from './competitions/competitions.module';
import { TeamsModule } from './teams/teams.module';
import { RoundsModule } from './rounds/rounds.module';
import { ChallengesModule } from './challenges/challenges.module';
import { ScoringModule } from './scoring/scoring.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { ExecutionModule } from './execution/execution.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { AdminModule } from './admin/admin.module';
import { HealthModule } from './health/health.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { OriginGuard } from './auth/guards/origin.guard';
import { UserThrottlerGuard } from './common/guards/user-throttler.guard';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    // In-memory storage is deliberate: Redis is reserved for BullMQ so the
    // Upstash free-tier command budget is not spent on rate limiting. Correct
    // for a single instance; counters reset on deploy, which is why account
    // lockout is persisted in Postgres instead.
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'default', ttl: 60_000, limit: 100 },
        { name: 'burst', ttl: 60_000, limit: 100 },
        { name: 'sustained', ttl: 10_000, limit: 100 },
      ],
    }),
    MailModule,
    AuditModule,
    AuthModule,
    UsersModule,
    CompetitionsModule,
    TeamsModule,
    RoundsModule,
    ChallengesModule,
    LeaderboardModule,
    ScoringModule,
    ExecutionModule,
    SubmissionsModule,
    AdminModule,
    HealthModule,
  ],
  providers: [
    // Order matters: origin is checked first, then identity, then role, and the
    // throttler last so it can key on the resolved user.
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}

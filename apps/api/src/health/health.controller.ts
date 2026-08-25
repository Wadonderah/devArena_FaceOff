import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { Public } from '../common/decorators';
import { PrismaHealthIndicator } from './prisma.health';
import { RedisHealthIndicator } from './redis.health';
import { Judge0HealthIndicator } from './judge0.health';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaHealthIndicator,
    private readonly redis: RedisHealthIndicator,
    private readonly judge0: Judge0HealthIndicator,
  ) {}

  @Public()
  @Get('live')
  live() {
    return { status: 'ok', uptime: process.uptime() };
  }

  @Public()
  @Get()
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.prisma.check(),
      () => this.redis.check(),
      () => this.judge0.check(),
    ]);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PrismaHealthIndicator {
  private readonly logger = new Logger(PrismaHealthIndicator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly indicator: HealthIndicatorService,
  ) {}

  async check() {
    const check = this.indicator.check('database');
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return check.up();
    } catch (error) {
      // The real message names hosts and ports ("connect ECONNREFUSED
      // 10.0.1.5:5432"). /health is public and unauthenticated, so it says
      // only that the dependency is down; the detail goes to the log.
      this.logger.warn(`Health check failed: ${(error as Error).message}`);
      return check.down({ message: 'unreachable' });
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { Redis } from 'ioredis';
import { AppConfigService } from '../config/config.service';

@Injectable()
export class RedisHealthIndicator {
  private readonly logger = new Logger(RedisHealthIndicator.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly indicator: HealthIndicatorService,
  ) {}

  async check() {
    const check = this.indicator.check('redis');
    const client = new Redis(this.config.get('REDIS_URL'), {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
    });

    try {
      await client.connect();
      await client.ping();
      return check.up();
    } catch (error) {
      // The real message names hosts and ports ("connect ECONNREFUSED
      // 10.0.1.5:5432"). /health is public and unauthenticated, so it says
      // only that the dependency is down; the detail goes to the log.
      this.logger.warn(`Health check failed: ${(error as Error).message}`);
      return check.down({ message: 'unreachable' });
    } finally {
      client.disconnect();
    }
  }
}

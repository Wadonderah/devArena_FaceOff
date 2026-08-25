import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { Redis } from 'ioredis';
import { AppConfigService } from '../config/config.service';

@Injectable()
export class RedisHealthIndicator {
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
      return check.down({ message: (error as Error).message });
    } finally {
      client.disconnect();
    }
  }
}

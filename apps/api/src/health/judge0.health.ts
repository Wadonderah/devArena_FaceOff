import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { AppConfigService } from '../config/config.service';

@Injectable()
export class Judge0HealthIndicator {
  constructor(
    private readonly config: AppConfigService,
    private readonly indicator: HealthIndicatorService,
  ) {}

  async check() {
    const check = this.indicator.check('judge0');

    try {
      const response = await fetch(`${this.config.get('JUDGE0_URL')}/about`, {
        headers: { 'X-Auth-Token': this.config.get('JUDGE0_TOKEN') },
        signal: AbortSignal.timeout(3000),
      });

      if (!response.ok) {
        return check.down({ httpStatus: response.status });
      }

      const about = (await response.json()) as { version?: string };
      return check.up({ version: about.version });
    } catch (error) {
      return check.down({ message: (error as Error).message });
    }
  }
}

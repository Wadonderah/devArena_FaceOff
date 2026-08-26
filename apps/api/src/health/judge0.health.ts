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
      // /about only proves the web tier is answering. /workers reads the queue
      // from Judge0's own Redis, which is what submission creation depends on —
      // without it the probe reports healthy while no code can actually run.
      const [about, workers] = await Promise.all([
        this.request('/about'),
        this.request('/workers'),
      ]);

      if (!about.ok) {
        return check.down({ reason: 'api unreachable', httpStatus: about.status });
      }

      if (!workers.ok) {
        return check.down({
          reason: 'queue backend unavailable — submissions cannot be graded',
          httpStatus: workers.status,
        });
      }

      const info = (await about.json().catch(() => ({}))) as { version?: string };
      return check.up({ version: info.version });
    } catch (error) {
      return check.down({ message: (error as Error).message });
    }
  }

  private request(path: string): Promise<Response> {
    return fetch(`${this.config.get('JUDGE0_URL')}${path}`, {
      headers: { 'X-Auth-Token': this.config.get('JUDGE0_TOKEN') },
      signal: AbortSignal.timeout(3000),
    });
  }
}

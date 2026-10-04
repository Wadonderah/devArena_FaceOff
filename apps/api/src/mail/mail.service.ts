import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';

export interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const SEND_TIMEOUT_MS = 10_000;

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: AppConfigService) {}

  /// Announce the active driver at startup.
  ///
  /// Without this, "no mail arrived and there is nothing in the logs" is
  /// ambiguous between the console driver being active and a real send being
  /// silently accepted. One line at boot removes that whole class of confusion.
  onModuleInit(): void {
    const driver = this.config.get('MAIL_DRIVER');
    this.logger.log(
      driver === 'console'
        ? 'Mail driver: console — messages are logged, never delivered'
        : `Mail driver: resend — sending as ${this.senderAddress()}`,
    );
  }

  async send(email: OutboundEmail): Promise<void> {
    if (this.config.get('MAIL_DRIVER') === 'console') {
      
      this.logger.log(`[console mail] to=${email.to} subject="${email.subject}"\n${email.text}`);
      return;
    }

    await this.sendViaResend(email);
  }

  /// Resend takes the sender as one RFC 5322 string rather than as separate
  /// fields, so it is assembled here instead of in the request body.
  private senderAddress(): string {
    const address = this.config.get('RESEND_FROM_ADDRESS');
    const name = this.config.get('RESEND_FROM_NAME');
    return name ? `${name} <${address}>` : `${address}`;
  }

  private async sendViaResend(email: OutboundEmail): Promise<void> {
    let response: Response;

    try {
      response = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          // The key is stored bare in the environment and the scheme is added
          // here. Keeping "Bearer " out of the env var means a key pasted
          // straight from the Resend dashboard is correct as-is.
          Authorization: `Bearer ${this.config.get('RESEND_API_KEY') as string}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          from: this.senderAddress(),
          to: [email.to],
          subject: email.subject,
          html: email.html,
          text: email.text,
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
    } catch (error) {
      // DNS failure, connection refused, or the 10s timeout. This must not
      // escape: it would turn a mail problem into a 500 on registration.
      this.logger.error(
        `Resend unreachable while sending to ${email.to}: ${(error as Error).message}`,
      );
      return;
    }

    const body = await response.text().catch(() => '');

    if (!response.ok) {
      // Logged with the status and the whole body because the body is where the
      // actionable part lives: an unverified sending domain, an exhausted quota
      // and a revoked key are all 4xx and are otherwise indistinguishable.
      this.logger.error(`Resend rejected message to ${email.to}: ${response.status} ${body}`);
      return;
    }

    // Resend returns {"id": "..."} on acceptance. That id is what their
    // dashboard and support search on, so it is the one field worth surfacing.
    const id = extractMessageId(body);
    this.logger.log(
      `Resend accepted message to ${email.to}` + (id ? ` (id ${id})` : ''),
    );
  }
}

function extractMessageId(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { id?: string };
    return parsed.id ?? null;
  } catch {
    return null;
  }
}

import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';

export interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const ZEPTOMAIL_ENDPOINT = 'https://api.zeptomail.com/v1.1/email';
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
        : `Mail driver: zeptomail — sending as ${this.config.get('ZEPTOMAIL_FROM_ADDRESS')}`,
    );
  }

  async send(email: OutboundEmail): Promise<void> {
    if (this.config.get('MAIL_DRIVER') === 'console') {
      // `log`, not `debug`: this is the only record that a message existed, and
      // debug output is the first thing a production log level filters out.
      this.logger.log(`[console mail] to=${email.to} subject="${email.subject}"\n${email.text}`);
      return;
    }

    await this.sendViaZeptoMail(email);
  }


  private async sendViaZeptoMail(email: OutboundEmail): Promise<void> {
    let response: Response;

    try {
      response = await fetch(ZEPTOMAIL_ENDPOINT, {
        method: 'POST',
        headers: {
          // ZeptoMail expects "Zoho-enczapikey <key>". The env schema enforces
          // that prefix at boot, so the value is passed through whole.
          Authorization: this.config.get('ZEPTOMAIL_TOKEN') as string,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          from: {
            address: this.config.get('ZEPTOMAIL_FROM_ADDRESS'),
            name: this.config.get('ZEPTOMAIL_FROM_NAME'),
          },
          to: [{ email_address: { address: email.to } }],
          subject: email.subject,
          htmlbody: email.html,
          textbody: email.text,
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
    } catch (error) {
      // DNS failure, connection refused, or the 10s timeout. Previously this
      // escaped and turned a mail problem into a 500 on registration.
      this.logger.error(
        `ZeptoMail unreachable while sending to ${email.to}: ${(error as Error).message}`,
      );
      return;
    }

    const body = await response.text().catch(() => '');

    if (!response.ok) {
      this.logger.error(
        `ZeptoMail rejected message to ${email.to}: ${response.status} ${body}`,
      );
      return;
    }

    // request_id is what ZeptoMail's own support and dashboard search on, so it
    // is the one field worth pulling out of an accepted response.
    const requestId = extractRequestId(body);
    this.logger.log(
      `ZeptoMail accepted message to ${email.to}` + (requestId ? ` (request_id ${requestId})` : ''),
    );
  }
}

function extractRequestId(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { request_id?: string };
    return parsed.request_id ?? null;
  } catch {
    return null;
  }
}

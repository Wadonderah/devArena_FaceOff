import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';

export interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: AppConfigService) {}

  async send(email: OutboundEmail): Promise<void> {
    if (this.config.get('MAIL_DRIVER') === 'console') {
      this.logger.debug(`[console mail] to=${email.to} subject="${email.subject}"\n${email.text}`);
      return;
    }

    await this.sendViaZeptoMail(email);
  }

  private async sendViaZeptoMail(email: OutboundEmail): Promise<void> {
    const response = await fetch('https://api.zeptomail.com/v1.1/email', {
      method: 'POST',
      headers: {
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
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      // Logged, not thrown: a mail outage must not fail the caller's request
      // (a failed registration is worse than a delayed verification email).
      this.logger.error(`ZeptoMail rejected message to ${email.to}: ${response.status} ${body}`);
    }
  }
}

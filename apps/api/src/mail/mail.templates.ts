import type { OutboundEmail } from './mail.service';

const shell = (heading: string, body: string, cta?: { label: string; url: string }): string => `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;padding:32px;color:#e2e8f0">
  <div style="max-width:520px;margin:0 auto;background:#1e293b;border-radius:12px;padding:32px">
    <h1 style="margin:0 0 16px;font-size:20px;color:#f8fafc">${heading}</h1>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#cbd5e1">${body}</p>
    ${
      cta
        ? `<a href="${cta.url}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">${cta.label}</a>
    <p style="margin:24px 0 0;font-size:12px;color:#94a3b8">Or paste this link into your browser:<br>${cta.url}</p>`
        : ''
    }
  </div>
</div>`;

export function verificationEmail(to: string, url: string): OutboundEmail {
  return {
    to,
    subject: 'Verify your Face-Off account',
    html: shell(
      'Verify your email',
      'Confirm this address to join the competition. This link expires in 24 hours.',
      { label: 'Verify email', url },
    ),
    text: `Verify your Face-Off account by opening this link (expires in 24 hours):\n${url}`,
  };
}

export function passwordResetEmail(to: string, url: string): OutboundEmail {
  return {
    to,
    subject: 'Reset your Face-Off password',
    html: shell(
      'Reset your password',
      'Use the button below to choose a new password. This link expires in 1 hour. If you did not request this, you can ignore this email.',
      { label: 'Reset password', url },
    ),
    text: `Reset your Face-Off password (link expires in 1 hour):\n${url}`,
  };
}

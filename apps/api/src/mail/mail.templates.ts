import type { OutboundEmail } from './mail.service';

// Palette lifted from apps/web/app/globals.css and the Akwannya Hub logo, so a
// verification email looks like it came from the same product as the site.
const TEAL = '#0a7c78';
const TEAL_DEEP = '#073a38';
const ORANGE = '#d95f00';
const PAGE_BG = '#eef3f5';
const CARD_BG = '#ffffff';
const INK = '#16202b';
const INK_DIM = '#54657a';
const INK_FAINT = '#8395a8';
const LINE = '#dfe6ec';

const LOGO_URL = 'https://akwannya-hub.org/logo-full.png';
const SITE_URL = 'https://faceoff.akwannya-hub.org';

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/// Escape a value for use inside a double-quoted HTML attribute.
///
/// The only interpolated value in these templates is a URL we build ourselves,
/// so this is defence in depth rather than a fix for a known hole. It costs
/// nothing and means a future caller passing something less trustworthy cannot
/// break out of the href.
const attr = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/// One shell for every message, built on tables.
///
/// Tables rather than divs because Outlook on Windows renders mail through
/// Word, which ignores most modern layout CSS. Styles are inline for the same
/// family of reasons: Gmail strips <style> blocks entirely.
///
/// `preheader` is the grey line a client shows beside the subject in the inbox
/// list. Without one it scrapes the first visible text, which would just repeat
/// the heading and waste the only other thing the recipient reads before
/// deciding to open.
const shell = (
  heading: string,
  body: string,
  preheader: string,
  cta?: { label: string; url: string },
): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${heading}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG}">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${preheader}</div>
  <!-- Pushes the body copy out of the inbox preview snippet. -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${'&#8204;&nbsp;'.repeat(60)}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAGE_BG}">
    <tr>
      <td align="center" style="padding:32px 16px">

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${CARD_BG};border-radius:14px;overflow:hidden;border:1px solid ${LINE}">

          <!-- Brand bar: teal with an orange end, the same device as the cover
               of the onboarding document. -->
          <tr>
            <td style="height:5px;line-height:5px;font-size:0">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="68%" bgcolor="${TEAL}" style="height:5px;line-height:5px;font-size:0">&nbsp;</td>
                  <td width="32%" bgcolor="${ORANGE}" style="height:5px;line-height:5px;font-size:0">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <!-- bgcolor is explicit because the hosted logo is RGB with a
                 near-white background and no alpha. On a white card that is a
                 1-level difference nobody can see, but Gmail and Outlook dark
                 mode recolour light backgrounds, and without this the logo
                 would then float in a white rectangle. -->
            <td align="center" bgcolor="${CARD_BG}" style="padding:30px 32px 0;background:${CARD_BG}">
              <!-- Most clients block images by default, so the wordmark below
                   carries the identity on its own and the logo is a bonus. -->
              <img src="${LOGO_URL}" width="150" alt="Akwannya Hub"
                   style="display:block;width:150px;max-width:150px;height:auto;border:0;outline:none">
              <p style="margin:14px 0 0;font-family:${FONT};font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:${TEAL};font-weight:600">
                Software Engineering Face-Off
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:26px 32px 0">
              <h1 style="margin:0 0 12px;font-family:${FONT};font-size:22px;line-height:1.3;font-weight:700;color:${TEAL_DEEP}">${heading}</h1>
              <p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.65;color:${INK_DIM}">${body}</p>
            </td>
          </tr>
${
  cta
    ? `
          <tr>
            <td align="center" style="padding:26px 32px 0">
              <!-- Table-based button: an inline-block anchor alone collapses in
                   Outlook, which ignores padding on inline elements. -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td bgcolor="${TEAL}" style="border-radius:9px">
                    <a href="${attr(cta.url)}"
                       style="display:inline-block;padding:13px 28px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:9px">${cta.label}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:22px 32px 0">
              <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${INK_FAINT}">
                If the button does not work, paste this into your browser:<br>
                <span style="color:${INK_DIM};word-break:break-all">${attr(cta.url)}</span>
              </p>
            </td>
          </tr>`
    : ''
}
          <tr>
            <td style="padding:26px 32px 28px">
              <div style="border-top:1px solid ${LINE};padding-top:16px">
                <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${INK_FAINT}">
                  You received this because someone used this address to sign up at
                  <a href="${SITE_URL}" style="color:${TEAL};text-decoration:none">faceoff.akwannya-hub.org</a>.
                  If that was not you, you can ignore this message.
                </p>
                <p style="margin:10px 0 0;font-family:${FONT};font-size:12px;color:${INK_FAINT}">
                  An <a href="https://akwannya-hub.org" style="color:${INK};text-decoration:none;font-weight:600">Akwannya Hub</a> program
                  &nbsp;·&nbsp; Opening Doors, Building Futures
                </p>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

export function verificationEmail(to: string, url: string): OutboundEmail {
  return {
    to,
    subject: 'Verify your Face-Off account',
    html: shell(
      'Verify your email',
      'Confirm this address to join the competition. This link expires in 24 hours.',
      'Confirm your address to join the competition. Expires in 24 hours.',
      { label: 'Verify email', url },
    ),
    text: [
      'Verify your Face-Off account',
      '',
      'Confirm this address to join the competition by opening the link below.',
      'It expires in 24 hours.',
      '',
      url,
      '',
      'If you did not sign up at faceoff.akwannya-hub.org, you can ignore this message.',
      '',
      'An Akwannya Hub program — Opening Doors, Building Futures',
    ].join('\n'),
  };
}

export function passwordResetEmail(to: string, url: string): OutboundEmail {
  return {
    to,
    subject: 'Reset your Face-Off password',
    html: shell(
      'Reset your password',
      'Use the button below to choose a new password. This link expires in 1 hour. If you did not request this, you can ignore this email and your password will stay as it is.',
      'Choose a new password. This link expires in 1 hour.',
      { label: 'Reset password', url },
    ),
    text: [
      'Reset your Face-Off password',
      '',
      'Open the link below to choose a new password. It expires in 1 hour.',
      '',
      url,
      '',
      'If you did not request this, ignore this message and your password will stay as it is.',
      '',
      'An Akwannya Hub program — Opening Doors, Building Futures',
    ].join('\n'),
  };
}

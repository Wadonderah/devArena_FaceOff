import { Logger } from '@nestjs/common';
import { MailService, type OutboundEmail } from './mail.service';
import type { AppConfigService } from '../config/config.service';

const makeConfig = (overrides: Record<string, unknown> = {}) =>
  ({
    get: (key: string) =>
      ({
        MAIL_DRIVER: 'resend',
        RESEND_API_KEY: 're_test_key',
        RESEND_FROM_ADDRESS: 'noreply@akwannya-hub.org',
        RESEND_FROM_NAME: 'Software Engineering Face-Off',
        ...overrides,
      })[key],
  }) as unknown as AppConfigService;

const email: OutboundEmail = {
  to: 'alice@example.com',
  subject: 'Verify your Face-Off account',
  html: '<p>hello</p>',
  text: 'hello',
};

const ok = (body: string) =>
  ({ ok: true, status: 200, text: () => Promise.resolve(body) }) as Response;

const notOk = (status: number, body: string) =>
  ({ ok: false, status, text: () => Promise.resolve(body) }) as Response;

describe('MailService', () => {
  let fetchMock: jest.SpyInstance;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
    // The logger is the only observable output of a send, so the assertions
    // below read it rather than reaching into private state.
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('console driver', () => {
    it('logs the message and never reaches the network', async () => {
      const service = new MailService(makeConfig({ MAIL_DRIVER: 'console' }));

      await service.send(email);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[console mail]'));
    });

    it('announces itself at boot so silence is never ambiguous', () => {
      const service = new MailService(makeConfig({ MAIL_DRIVER: 'console' }));

      service.onModuleInit();

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Mail driver: console'));
    });
  });

  describe('resend driver', () => {
    it('posts Resend’s request shape with a bearer token', async () => {
      fetchMock.mockResolvedValue(ok('{"id":"49a3999c-0ce1-4ea6-ab68-afcd6dc2e794"}'));
      const service = new MailService(makeConfig());

      await service.send(email);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

      expect(url).toBe('https://api.resend.com/emails');
      expect(init.method).toBe('POST');
      // The scheme is added by the service, not stored in the env var.
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test_key');

      // Resend differs from the previous provider in all four of these: the
      // sender is one string, the recipients are plain strings in an array,
      // and the bodies are `html`/`text` rather than `htmlbody`/`textbody`.
      expect(JSON.parse(init.body as string)).toEqual({
        from: 'Software Engineering Face-Off <noreply@akwannya-hub.org>',
        to: ['alice@example.com'],
        subject: 'Verify your Face-Off account',
        html: '<p>hello</p>',
        text: 'hello',
      });
    });

    it('logs the returned id, which is what Resend support searches on', async () => {
      fetchMock.mockResolvedValue(ok('{"id":"abc-123"}'));

      await new MailService(makeConfig()).send(email);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('(id abc-123)'));
    });

    it('still succeeds when the accepted response is not JSON', async () => {
      fetchMock.mockResolvedValue(ok('not json'));

      await new MailService(makeConfig()).send(email);

      expect(errorSpy).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Resend accepted message'));
    });

    it('announces the sender at boot', () => {
      new MailService(makeConfig()).onModuleInit();

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Mail driver: resend — sending as Software Engineering Face-Off <noreply@akwannya-hub.org>',
        ),
      );
    });
  });

  describe('failure handling', () => {
    // Registration awaits send(). If a mail failure escaped, a provider outage
    // would turn every signup into a 500 — which is exactly what a rate limit
    // or an unverified domain would cause on a launch day.
    it('does not throw when Resend rejects the message', async () => {
      const body = '{"statusCode":429,"message":"Too many requests","name":"rate_limit_exceeded"}';
      fetchMock.mockResolvedValue(notOk(429, body));

      await expect(new MailService(makeConfig()).send(email)).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Resend rejected message to alice@example.com: 429'),
      );
    });

    it('includes the response body, which is the only actionable part', async () => {
      const body = '{"statusCode":403,"name":"validation_error","message":"domain is not verified"}';
      fetchMock.mockResolvedValue(notOk(403, body));

      await new MailService(makeConfig()).send(email);

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('domain is not verified'));
    });

    it('does not throw when the network fails or the request times out', async () => {
      fetchMock.mockRejectedValue(new Error('The operation was aborted due to timeout'));

      await expect(new MailService(makeConfig()).send(email)).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Resend unreachable while sending to alice@example.com'),
      );
    });
  });
});

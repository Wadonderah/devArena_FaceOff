import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { ArgumentsHost } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

interface Captured {
  status: number;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

function makeHost(): { host: ArgumentsHost; captured: Captured } {
  const captured: Captured = { status: 0, body: {}, headers: {} };

  const response = {
    status: (code: number) => {
      captured.status = code;
      return response;
    },
    json: (payload: Record<string, unknown>) => {
      captured.body = payload;
    },
    setHeader: (name: string, value: string) => {
      captured.headers[name] = value;
    },
    getHeader: (name: string) => captured.headers[name],
  };

  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ method: 'POST', url: '/api/submissions/code/run' }),
    }),
  } as unknown as ArgumentsHost;

  return { host, captured };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  describe('rate limiting', () => {
    // Nest's ThrottlerException carries the literal string
    // "ThrottlerException: Too Many Requests", and the filter passed any string
    // payload through as `message` — so a participant with two tabs open saw an
    // exception class name in the interface.
    it('never leaks the exception class name to a participant', () => {
      const { host, captured } = makeHost();

      filter.catch(new ThrottlerException(), host);

      expect(captured.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(String(captured.body.message)).not.toMatch(/Throttler|Exception/i);
    });

    it('tags it with a stable code the client can branch on', () => {
      const { host, captured } = makeHost();

      filter.catch(new ThrottlerException(), host);

      // The frontend keys off this rather than the wording, so the message can
      // be rewritten without breaking the UI.
      expect(captured.body.code).toBe('RATE_LIMITED');
    });

    it('always sends a Retry-After so the client need not guess', () => {
      const { host, captured } = makeHost();

      filter.catch(new ThrottlerException(), host);

      expect(Number(captured.headers['Retry-After'])).toBeGreaterThan(0);
    });

    // ThrottlerGuard sets the header itself before throwing; the filter must
    // not overwrite a more accurate value with its own floor.
    it('preserves a Retry-After the guard already set', () => {
      const { host, captured } = makeHost();
      captured.headers['Retry-After'] = '42';

      filter.catch(new ThrottlerException(), host);

      expect(captured.headers['Retry-After']).toBe('42');
    });

    it('applies the clean message to any 429, not only ThrottlerException', () => {
      const { host, captured } = makeHost();

      filter.catch(new HttpException('raw upstream text', HttpStatus.TOO_MANY_REQUESTS), host);

      expect(captured.body.code).toBe('RATE_LIMITED');
      expect(captured.body.message).not.toBe('raw upstream text');
    });
  });

  describe('other statuses', () => {
    it('leaves validation details intact', () => {
      const { host, captured } = makeHost();

      filter.catch(
        new BadRequestException({
          message: ['password must be longer than 10 characters'],
          error: 'Bad Request',
          statusCode: 400,
        }),
        host,
      );

      expect(captured.status).toBe(400);
      expect(captured.body.details).toEqual(['password must be longer than 10 characters']);
    });

    it('does not add Retry-After to anything but a 429', () => {
      const { host, captured } = makeHost();

      filter.catch(new BadRequestException('nope'), host);

      expect(captured.headers['Retry-After']).toBeUndefined();
    });

    // Never leak an internal failure's message or stack to a caller.
    it('hides the detail of an unexpected error', () => {
      const { host, captured } = makeHost();

      filter.catch(new Error('connection string: postgres://user:password@host'), host);

      expect(captured.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(String(captured.body.message)).not.toMatch(/postgres|password/);
    });
  });
});

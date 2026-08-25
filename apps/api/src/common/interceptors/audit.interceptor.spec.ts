import { ExecutionContext } from '@nestjs/common';
import { Role } from '@prisma/client';
import { of } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor';
import type { AuditService } from '../../audit/audit.service';

function contextFor(
  method: string,
  user: unknown,
  body: unknown = {},
  params: Record<string, string> = {},
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method, user, body, params, ip: '10.0.0.1', headers: {} }),
    }),
    getClass: () => ({ name: 'ChallengesController' }),
    getHandler: () => ({ name: 'createMCQ' }),
  } as unknown as ExecutionContext;
}

const handler = { handle: () => of({ ok: true }) };

describe('AuditInterceptor', () => {
  let record: jest.Mock;
  let interceptor: AuditInterceptor;

  beforeEach(() => {
    record = jest.fn().mockResolvedValue(undefined);
    interceptor = new AuditInterceptor({ record } as unknown as AuditService);
  });

  const organizer = { id: 'u1', role: Role.ORGANIZER };

  it('records a staff mutation with actor, action and entity type', async () => {
    await new Promise((resolve) =>
      interceptor.intercept(contextFor('POST', organizer), handler).subscribe(resolve),
    );

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'u1',
        action: 'Challenges.createMCQ',
        entityType: 'Challenges',
        ipAddress: '10.0.0.1',
      }),
    );
  });

  it('ignores reads', async () => {
    await new Promise((resolve) =>
      interceptor.intercept(contextFor('GET', organizer), handler).subscribe(resolve),
    );
    expect(record).not.toHaveBeenCalled();
  });

  it('ignores participant traffic', async () => {
    await new Promise((resolve) =>
      interceptor
        .intercept(contextFor('POST', { id: 'u2', role: Role.PARTICIPANT }), handler)
        .subscribe(resolve),
    );
    expect(record).not.toHaveBeenCalled();
  });

  it('ignores unauthenticated traffic', async () => {
    await new Promise((resolve) =>
      interceptor.intercept(contextFor('POST', undefined), handler).subscribe(resolve),
    );
    expect(record).not.toHaveBeenCalled();
  });

  it('redacts credentials and submitted source code from the recorded body', async () => {
    const body = {
      title: 'Two Sum',
      password: 'hunter2',
      token: 'abc123',
      sourceCode: 'print(1)',
    };

    await new Promise((resolve) =>
      interceptor.intercept(contextFor('POST', organizer, body), handler).subscribe(resolve),
    );

    expect(record.mock.calls[0][0].metadata).toEqual({
      title: 'Two Sum',
      password: '[redacted]',
      token: '[redacted]',
      sourceCode: '[redacted]',
    });
  });

  it('does not record when the handler throws', async () => {
    const failing = { handle: () => ({ pipe: () => ({ subscribe: () => undefined }) }) };
    interceptor.intercept(contextFor('POST', organizer), failing as never);
    expect(record).not.toHaveBeenCalled();
  });

  it('picks up the entity id from route params', async () => {
    await new Promise((resolve) =>
      interceptor
        .intercept(contextFor('PATCH', organizer, {}, { id: 'challenge-7' }), handler)
        .subscribe(resolve),
    );
    expect(record.mock.calls[0][0].entityId).toBe('challenge-7');
  });
});

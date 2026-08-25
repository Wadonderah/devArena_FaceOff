import { ServiceUnavailableException } from '@nestjs/common';
import { Judge0Client, type Judge0SubmissionSpec } from './judge0.client';
import { JUDGE0_STATUS } from './judge0.status';
import type { AppConfigService } from '../config/config.service';

const config = {
  get: (key: string) =>
    ({ JUDGE0_URL: 'http://judge0.internal:2358', JUDGE0_TOKEN: 'secret-token' })[key],
} as unknown as AppConfigService;

const spec: Judge0SubmissionSpec = {
  languageId: 71,
  sourceCode: 'print("héllo")',
  stdin: '1 2',
  expectedOutput: '3',
  cpuTimeLimit: 2,
  wallTimeLimit: 6,
  memoryLimitKb: 128000,
  maxProcesses: 30,
  maxFileSizeKb: 4096,
};

function mockFetch(...responses: unknown[]) {
  const fn = jest.fn();
  for (const body of responses) {
    fn.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    });
  }
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

describe('Judge0Client', () => {
  afterEach(() => jest.restoreAllMocks());

  describe('submitBatch', () => {
    it('disables network access for every submission', async () => {
      const fetchMock = mockFetch([{ token: 't1' }]);
      await new Judge0Client(config).submitBatch([spec]);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.submissions[0].enable_network).toBe(false);
    });

    it('sends every resource limit rather than relying on server defaults', async () => {
      const fetchMock = mockFetch([{ token: 't1' }]);
      await new Judge0Client(config).submitBatch([spec]);

      const submission = JSON.parse(fetchMock.mock.calls[0][1].body).submissions[0];
      expect(submission).toMatchObject({
        cpu_time_limit: 2,
        wall_time_limit: 6,
        memory_limit: 128000,
        max_processes_and_or_threads: 30,
        max_file_size: 4096,
      });
    });

    it('base64-encodes source, stdin and expected output so bytes survive transport', async () => {
      const fetchMock = mockFetch([{ token: 't1' }]);
      await new Judge0Client(config).submitBatch([spec]);

      const submission = JSON.parse(fetchMock.mock.calls[0][1].body).submissions[0];
      expect(submission.source_code).toBe(b64('print("héllo")'));
      expect(submission.stdin).toBe(b64('1 2'));
      expect(submission.expected_output).toBe(b64('3'));
    });

    it('authenticates with the auth token header', async () => {
      const fetchMock = mockFetch([{ token: 't1' }]);
      await new Judge0Client(config).submitBatch([spec]);

      expect(fetchMock.mock.calls[0][1].headers['X-Auth-Token']).toBe('secret-token');
    });

    it('submits one Judge0 entry per test case', async () => {
      const fetchMock = mockFetch([{ token: 't1' }, { token: 't2' }]);
      await new Judge0Client(config).submitBatch([spec, spec]);

      expect(JSON.parse(fetchMock.mock.calls[0][1].body).submissions).toHaveLength(2);
    });
  });

  describe('awaitBatch', () => {
    it('decodes base64 output fields', async () => {
      mockFetch({
        submissions: [
          {
            token: 't1',
            status: { id: JUDGE0_STATUS.ACCEPTED },
            stdout: b64('3\n'),
            stderr: null,
            time: '0.012',
            memory: 3200,
          },
        ],
      });

      const [result] = await new Judge0Client(config).awaitBatch(['t1']);
      expect(result.stdout).toBe('3\n');
      expect(result.timeSeconds).toBe(0.012);
      expect(result.memoryKb).toBe(3200);
    });

    it('keeps polling while a submission is still processing', async () => {
      const fetchMock = mockFetch(
        { submissions: [{ token: 't1', status: { id: JUDGE0_STATUS.PROCESSING } }] },
        { submissions: [{ token: 't1', status: { id: JUDGE0_STATUS.ACCEPTED } }] },
      );

      const [result] = await new Judge0Client(config).awaitBatch(['t1']);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.statusId).toBe(JUDGE0_STATUS.ACCEPTED);
    });

    it('treats a missing status as an internal error rather than a pass', async () => {
      mockFetch({ submissions: [{ token: 't1' }] });
      const [result] = await new Judge0Client(config).awaitBatch(['t1']);
      expect(result.statusId).toBe(JUDGE0_STATUS.INTERNAL_ERROR);
    });
  });

  describe('failure handling', () => {
    it('reports unavailability rather than leaking the transport error', async () => {
      global.fetch = jest.fn().mockRejectedValue(
        new Error('connect ECONNREFUSED 127.0.0.1:2358'),
      ) as unknown as typeof fetch;

      await expect(new Judge0Client(config).about()).rejects.toThrow(
        ServiceUnavailableException,
      );
      await expect(new Judge0Client(config).about()).rejects.not.toThrow(/ECONNREFUSED/);
    });

    it('surfaces a rejected request as unavailable', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'unauthorized',
      }) as unknown as typeof fetch;

      await expect(new Judge0Client(config).about()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});

import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
import { isTerminal } from './judge0.status';

export interface Judge0SubmissionSpec {
  languageId: number;
  sourceCode: string;
  stdin: string;
  expectedOutput: string;
  cpuTimeLimit: number;
  wallTimeLimit: number;
  memoryLimitKb: number;
  maxProcesses: number;
  maxFileSizeKb: number;
}

export interface Judge0Result {
  token: string;
  statusId: number;
  stdout: string | null;
  stderr: string | null;
  compileOutput: string | null;
  message: string | null;
  timeSeconds: number | null;
  memoryKb: number | null;
}

interface RawJudge0Result {
  token: string;
  status?: { id: number };
  stdout?: string | null;
  stderr?: string | null;
  compile_output?: string | null;
  message?: string | null;
  time?: string | null;
  memory?: number | null;
}

const POLL_INTERVAL_MS = 400;
const POLL_BACKOFF = 1.4;
const POLL_MAX_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 60_000;
const REQUEST_TIMEOUT_MS = 15_000;

@Injectable()
export class Judge0Client {
  private readonly logger = new Logger(Judge0Client.name);

  constructor(private readonly config: AppConfigService) {}

  async about(): Promise<{ version: string }> {
    return this.request<{ version: string }>('GET', '/about');
  }

  async languages(): Promise<{ id: number; name: string }[]> {
    return this.request<{ id: number; name: string }[]>('GET', '/languages');
  }

  /// Submits every test case as one Judge0 batch and returns the tokens.
  ///
  /// `wait=false` because a synchronous batch would tie up an HTTP connection for
  /// the whole execution; results are collected by polling instead. Everything is
  /// base64 encoded so arbitrary bytes in stdin or source survive transport.
  async submitBatch(specs: Judge0SubmissionSpec[]): Promise<string[]> {
    const body = {
      submissions: specs.map((spec) => ({
        language_id: spec.languageId,
        source_code: b64(spec.sourceCode),
        stdin: b64(spec.stdin),
        expected_output: b64(spec.expectedOutput),
        cpu_time_limit: spec.cpuTimeLimit,
        wall_time_limit: spec.wallTimeLimit,
        memory_limit: spec.memoryLimitKb,
        max_processes_and_or_threads: spec.maxProcesses,
        max_file_size: spec.maxFileSizeKb,
        // Non-negotiable: submitted code must never reach the network.
        enable_network: false,
        redirect_stderr_to_stdout: false,
      })),
    };

    const created = await this.request<{ token: string }[]>(
      'POST',
      '/submissions/batch?base64_encoded=true',
      body,
    );

    return created.map((c) => c.token);
  }

  /// Polls until every token reaches a terminal status, with capped exponential
  /// backoff so a slow batch does not hammer Judge0.
  async awaitBatch(tokens: string[]): Promise<Judge0Result[]> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let interval = POLL_INTERVAL_MS;

    for (;;) {
      const results = await this.fetchBatch(tokens);

      if (results.every((r) => isTerminal(r.statusId))) {
        return results;
      }

      if (Date.now() > deadline) {
        throw new ServiceUnavailableException(
          'The grading service did not return results in time',
        );
      }

      await sleep(interval);
      interval = Math.min(interval * POLL_BACKOFF, POLL_MAX_INTERVAL_MS);
    }
  }

  private async fetchBatch(tokens: string[]): Promise<Judge0Result[]> {
    const fields = [
      'token',
      'status_id',
      'stdout',
      'stderr',
      'compile_output',
      'message',
      'time',
      'memory',
    ].join(',');

    const response = await this.request<{ submissions: RawJudge0Result[] }>(
      'GET',
      `/submissions/batch?tokens=${tokens.join(',')}&base64_encoded=true&fields=${fields}`,
    );

    return response.submissions.map((raw) => ({
      token: raw.token,
      statusId: raw.status?.id ?? (raw as unknown as { status_id?: number }).status_id ?? 13,
      stdout: unb64(raw.stdout),
      stderr: unb64(raw.stderr),
      compileOutput: unb64(raw.compile_output),
      message: unb64(raw.message),
      timeSeconds: raw.time ? Number(raw.time) : null,
      memoryKb: raw.memory ?? null,
    }));
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.config.get('JUDGE0_URL')}${path}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          'X-Auth-Token': this.config.get('JUDGE0_TOKEN'),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error(`Judge0 ${method} ${path} failed: ${(error as Error).message}`);
      throw new ServiceUnavailableException('The grading service is unavailable');
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      this.logger.error(`Judge0 ${method} ${path} -> ${response.status} ${detail}`);

      // 4xx and 5xx used to raise the same exception, so a permanently
      // malformed request — a bad language id, an oversized payload, a revoked
      // auth token — consumed all three BullMQ attempts and waited out the
      // backoff before failing anyway. Retrying something Judge0 has already
      // judged invalid cannot succeed; it only delays the participant's answer
      // and spends the queue's capacity during a live round.
      //
      // 429 is the exception among 4xx: it is explicitly "try later".
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        throw new Judge0RequestError(
          `The grading service rejected the request (${response.status})`,
        );
      }

      throw new ServiceUnavailableException('The grading service is unavailable');
    }

    return (await response.json()) as T;
  }
}

/// A fault in the request we sent, not in the service we sent it to.
///
/// Separated from ServiceUnavailableException so the grading worker can tell
/// "this will never succeed" from "this might succeed in two seconds", and stop
/// retrying the first kind.
export class Judge0RequestError extends Error {
  readonly retryable = false;

  constructor(message: string) {
    super(message);
    this.name = 'Judge0RequestError';
  }
}

const b64 = (value: string): string => Buffer.from(value, 'utf8').toString('base64');

/// Judge0's own ceiling is `max_file_size` (up to 1 MB per stream, per test).
/// Nothing downstream needs more than a screenful: the participant reads the
/// first lines of a diff, and the database should not hold a megabyte of
/// `print("x" * 10**6)` per visible case per attempt. Truncation happens at
/// the one place output enters the process, so every consumer is bounded.
export const MAX_OUTPUT_BYTES = 16 * 1024;

const unb64 = (value: string | null | undefined): string | null => {
  if (!value) return null;

  const bytes = Buffer.from(value, 'base64');
  if (bytes.length <= MAX_OUTPUT_BYTES) return bytes.toString('utf8');

  // Back up to a character boundary before cutting. A UTF-8 continuation byte
  // is 10xxxxxx; stepping past any of those lands on the start of a character,
  // so the slice never ends mid-sequence and never decodes to U+FFFD.
  let end = MAX_OUTPUT_BYTES;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end -= 1;

  const kept = bytes.subarray(0, end).toString('utf8');
  return `${kept}\n… [output truncated at ${MAX_OUTPUT_BYTES / 1024} KB]`;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

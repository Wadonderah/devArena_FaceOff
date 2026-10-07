type ApiModule = typeof import('./api');

// `refreshInFlight` is module-level state by design — it is what makes several
// simultaneous 401s share one refresh. That means it survives between tests, so
// each test gets a freshly-loaded copy of the module rather than inheriting a
// resolved refresh from the one before it.
let api: ApiModule['api'];
let ApiError: ApiModule['ApiError'];
let describeError: ApiModule['describeError'];

beforeEach(async () => {
  jest.resetModules();
  ({ api, ApiError, describeError } = await import('./api'));
});

/// Builds a fetch double that returns 401 for the first `unauthorizedCalls`
/// requests to the API, then 200 — modelling an expired access cookie that a
/// refresh repairs.
function makeFetch(opts: { unauthorizedCalls?: number; refreshOk?: boolean } = {}) {
  const { unauthorizedCalls = 1, refreshOk = true } = opts;
  const calls: string[] = [];
  let unauthorized = unauthorizedCalls;

  const fetchMock = jest.fn(async (url: string) => {
    calls.push(url);

    if (url.includes('/auth/refresh')) {
      return { ok: refreshOk, status: refreshOk ? 200 : 401, json: async () => ({}) } as Response;
    }

    if (unauthorized > 0) {
      unauthorized -= 1;
      return {
        ok: false,
        status: 401,
        json: async () => ({ statusCode: 401, code: 'UNAUTHORIZED', message: 'Invalid session' }),
      } as Response;
    }

    return { ok: true, status: 200, json: async () => ({ user: { id: 'u1' } }) } as Response;
  });

  return { fetchMock, calls };
}

const paths = (calls: string[]) =>
  calls.map((c) => c.replace(/^.*\/api/, '')).map((c) => c.split('?')[0]);

describe('api()', () => {
  afterEach(() => jest.restoreAllMocks());

  // The bug Belinda hit mid-Code-Sprint. /auth/me is the single call that
  // decides whether you are signed in, and a blanket `!path.startsWith('/auth/')`
  // excluded it from the refresh-and-retry — so an expired access cookie signed
  // her out while a perfectly good refresh cookie sat unused in the browser.
  it('refreshes and retries when /auth/me returns 401', async () => {
    const { fetchMock, calls } = makeFetch();
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock as unknown as typeof fetch);

    await expect(api('/auth/me')).resolves.toEqual({ user: { id: 'u1' } });

    expect(paths(calls)).toEqual(['/auth/me', '/auth/refresh', '/auth/me']);
  });

  it('retries at most once, so a persistent 401 cannot loop', async () => {
    const { fetchMock, calls } = makeFetch({ unauthorizedCalls: 99 });
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock as unknown as typeof fetch);

    await expect(api('/auth/me')).rejects.toBeInstanceOf(ApiError);

    expect(calls.filter((c) => c.includes('/auth/refresh'))).toHaveLength(1);
  });

  it('gives up without retrying when the refresh itself fails', async () => {
    const { fetchMock, calls } = makeFetch({ refreshOk: false });
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock as unknown as typeof fetch);

    await expect(api('/auth/me')).rejects.toMatchObject({ status: 401 });

    expect(paths(calls)).toEqual(['/auth/me', '/auth/refresh']);
  });

  // A 401 from these is the answer, not a stale session — retrying them after a
  // refresh would be meaningless.
  it.each(['/auth/login', '/auth/register', '/auth/logout'])(
    'does not attempt a refresh for %s',
    async (path) => {
      const { fetchMock, calls } = makeFetch({ unauthorizedCalls: 99 });
      jest.spyOn(global, 'fetch').mockImplementation(fetchMock as unknown as typeof fetch);

      await expect(api(path, { method: 'POST' })).rejects.toBeInstanceOf(ApiError);

      expect(calls.filter((c) => c.includes('/auth/refresh'))).toHaveLength(0);
    },
  );

  // The one that would recurse: a 401 from the refresh endpoint itself must not
  // trigger another refresh, or an expired session spins forever.
  it('does not refresh in response to a failing refresh', async () => {
    const { fetchMock, calls } = makeFetch({ refreshOk: false });
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock as unknown as typeof fetch);

    await expect(api('/auth/refresh', { method: 'POST' })).rejects.toBeInstanceOf(ApiError);

    expect(calls).toHaveLength(1);
  });

  // The exclusion list is matched against the path without its query string,
  // or `/auth/login?next=/x` would slip past it.
  it('ignores a query string when deciding whether to refresh', async () => {
    const { fetchMock, calls } = makeFetch({ unauthorizedCalls: 99 });
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock as unknown as typeof fetch);

    await expect(api('/auth/login?next=%2Fdashboard', { method: 'POST' })).rejects.toBeInstanceOf(
      ApiError,
    );

    expect(calls.filter((c) => c.includes('/auth/refresh'))).toHaveLength(0);
  });

  it('shares one refresh across simultaneous 401s', async () => {
    const { fetchMock, calls } = makeFetch({ unauthorizedCalls: 3 });
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock as unknown as typeof fetch);

    await Promise.all([api('/auth/me'), api('/competitions'), api('/teams/t1')]);

    // Three 401s, but the API rotates refresh tokens — a second concurrent
    // refresh would replay an already-rotated token and be treated as theft,
    // revoking the whole session.
    expect(calls.filter((c) => c.includes('/auth/refresh'))).toHaveLength(1);
  });
});

describe('describeError', () => {
  it('turns a rate limit into something a participant can act on', () => {
    const err = new ApiError(429, 'RATE_LIMITED', 'ThrottlerException: Too Many Requests');

    const { title, detail, rateLimited } = describeError(err);

    expect(rateLimited).toBe(true);
    expect(`${title} ${detail}`).not.toMatch(/Throttler|Exception/);
  });

  it('prefers the first validation detail over the wrapper message', () => {
    const err = new ApiError(400, 'VALIDATION_FAILED', 'Request validation failed', [
      'password must be longer than 10 characters',
    ]);

    expect(describeError(err).detail).toBe('password must be longer than 10 characters');
  });
});

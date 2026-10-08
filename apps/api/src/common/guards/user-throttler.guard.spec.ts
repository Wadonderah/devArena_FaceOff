import type { Request } from 'express';
import { UserThrottlerGuard } from './user-throttler.guard';
import type { AuthenticatedUser } from '../decorators';

type Tracked = Request & { user?: AuthenticatedUser };

// getTracker is protected; the test reaches it the way a subclass would.
class Probe extends UserThrottlerGuard {
  track(req: Tracked): Promise<string> {
    return this.getTracker(req);
  }
}

// getTracker touches none of the base class's collaborators, so they are not
// worth constructing.
const guard = () => new Probe(null as never, null as never, null as never);

describe('UserThrottlerGuard.getTracker', () => {
  const user = { id: 'user-1' } as AuthenticatedUser;

  // A whole venue behind one NAT is the pilot's actual setup. Keying
  // authenticated traffic by IP would let one participant's submissions
  // rate-limit everyone else in the room.
  it('keys an authenticated request by user, not address', async () => {
    const a = await guard().track({ user, ip: '10.0.0.1' } as Tracked);
    const b = await guard().track({ user, ip: '10.0.0.2' } as Tracked);

    expect(a).toBe(b);
  });

  it('keys two participants at the same address separately', async () => {
    const a = await guard().track({ user: { id: 'user-1' }, ip: '10.0.0.1' } as Tracked);
    const b = await guard().track({ user: { id: 'user-2' }, ip: '10.0.0.1' } as Tracked);

    expect(a).not.toBe(b);
  });

  // Login and register have no user yet, so IP is all there is.
  it('falls back to the address when unauthenticated', async () => {
    const a = await guard().track({ ip: '10.0.0.1' } as Tracked);
    const b = await guard().track({ ip: '10.0.0.1' } as Tracked);

    expect(a).toBe(b);
    expect(a).toContain('10.0.0.1');
  });

  // The old fallback was the literal 'unknown': one shared bucket for every
  // caller Express could not resolve an address for, so a handful of them could
  // lock each other out for reasons none of them could see.
  it('does not put address-less callers in one shared bucket', async () => {
    const a = await guard().track({} as Tracked);
    const b = await guard().track({} as Tracked);

    expect(a).not.toBe(b);
  });

  // Without namespacing, a user whose id happened to equal an IP string would
  // share that address's bucket.
  it('keeps user and address namespaces apart', async () => {
    const byUser = await guard().track({ user: { id: '10.0.0.1' } } as Tracked);
    const byIp = await guard().track({ ip: '10.0.0.1' } as Tracked);

    expect(byUser).not.toBe(byIp);
  });
});

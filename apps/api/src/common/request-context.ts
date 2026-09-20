import type { Request } from 'express';

/// The two facts about a request that belong in an audit row.
///
/// Passed explicitly from controllers rather than pulled from a request-scoped
/// provider, so a service stays testable with a plain object.
export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
}

export function requestContext(req: Request): RequestContext {
  return {
    ip: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  };
}

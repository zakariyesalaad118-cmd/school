import type { NextFunction, Request, Response } from 'express';
import { getClientIp } from '../utils/security.ts';

interface Bucket {
  timestamps: number[];
}

export function createSlidingWindowLimiter(options: {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: Request) => string;
  message?: string;
}) {
  const buckets = new Map<string, Bucket>();

  // Periodically prune stale buckets to keep memory bounded
  setInterval(() => {
    const cutoff = Date.now() - options.windowMs;
    for (const [key, bucket] of buckets.entries()) {
      bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);
      if (bucket.timestamps.length === 0) {
        buckets.delete(key);
      }
    }
  }, Math.max(options.windowMs, 60_000)).unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const cutoff = now - options.windowMs;
    const key = options.keyGenerator ? options.keyGenerator(req) : getClientIp(req);
    const bucket = buckets.get(key) || { timestamps: [] };
    bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

    if (bucket.timestamps.length >= options.maxRequests) {
      const oldest = bucket.timestamps[0] || now;
      const retryAfterSec = Math.max(1, Math.ceil((oldest + options.windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        error: options.message || 'Too many requests. Please try again later.',
        code: 'RATE_LIMITED',
        retryAfterSeconds: retryAfterSec,
      });
      return;
    }

    bucket.timestamps.push(now);
    buckets.set(key, bucket);
    next();
  };
}

export const loginRateLimiter = createSlidingWindowLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 15,
  keyGenerator: (req) => {
    const ip = getClientIp(req);
    const identifier =
      typeof req.body?.identifier === 'string' ? req.body.identifier.toLowerCase().trim() : '';
    return `${ip}:${identifier}`;
  },
  message: 'Too many login attempts. Please wait before trying again.',
});

export const apiRateLimiter = createSlidingWindowLimiter({
  windowMs: 60 * 1000,
  maxRequests: 300,
});

import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error.js";
import { ErrorCodes } from "../errors/codes.js";

export const PUBLIC_SESSION_LIMIT = 10;
export const PUBLIC_STREAM_LIMIT = 20;
export const PUBLIC_RATE_WINDOW_MS = 60_000;

export const RATE_LIMIT_MESSAGE = "Too many requests, please slow down.";

export type RateLimitHit = {
  key: string;
  limit: number;
  windowMs: number;
  now: number;
};

export type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * One process keeps timestamps in a Map.
 * A Redis store can implement the same method with a sorted set per key,
 * so several API nodes share one window.
 */
export interface RateLimitStore {
  hit(input: RateLimitHit): Promise<RateLimitDecision>;
}

export class MemorySlidingWindowStore implements RateLimitStore {
  private readonly hits = new Map<string, number[]>();

  async hit(input: RateLimitHit): Promise<RateLimitDecision> {
    const windowStart = input.now - input.windowMs;
    const recent = (this.hits.get(input.key) ?? []).filter((timestamp) => timestamp > windowStart);

    if (recent.length >= input.limit) {
      this.hits.set(input.key, recent);
      const oldest = recent[0] ?? input.now;
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + input.windowMs - input.now) / 1000));
      return { allowed: false, limit: input.limit, remaining: 0, retryAfterSeconds };
    }

    recent.push(input.now);
    this.hits.set(input.key, recent);
    return {
      allowed: true,
      limit: input.limit,
      remaining: input.limit - recent.length,
      retryAfterSeconds: 0,
    };
  }
}

type RateLimitOptions = {
  limit: number;
  windowMs: number;
  key: (req: Request) => string;
  now?: () => number;
};

export function createRateLimiter(store: RateLimitStore, options: RateLimitOptions) {
  const now = options.now ?? Date.now;

  return async function rateLimiter(req: Request, res: Response, next: NextFunction): Promise<void> {
    const decision = await store.hit({
      key: options.key(req),
      limit: options.limit,
      windowMs: options.windowMs,
      now: now(),
    });

    if (!decision.allowed) {
      res.setHeader("Retry-After", String(decision.retryAfterSeconds));
      next(new AppError(ErrorCodes.RATE_LIMIT_EXCEEDED, RATE_LIMIT_MESSAGE, 429));
      return;
    }

    next();
  };
}

export function clientIp(req: Request): string {
  const address = req.ip?.trim();
  if (address) {
    return address;
  }
  return req.socket.remoteAddress ?? "unknown";
}

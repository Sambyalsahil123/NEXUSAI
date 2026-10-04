import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error.js";
import { ErrorCodes } from "../errors/codes.js";
import type { AuthService } from "../services/auth.service.js";

export function createRequireAuth(authService: AuthService) {
  return async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const token = bearerToken(req.header("authorization"));
    if (!token) {
      next(new AppError(ErrorCodes.UNAUTHORIZED, "Authentication required", 401));
      return;
    }

    try {
      req.user = await authService.authenticateAccessToken(token);
      next();
    } catch (error) {
      next(error instanceof AppError ? error : new AppError(ErrorCodes.UNAUTHORIZED, "Invalid or expired token", 401));
    }
  };
}

function bearerToken(header: string | undefined): string | null {
  if (!header) {
    return null;
  }
  const match = /^Bearer ([^\s]+)$/.exec(header);
  return match?.[1] ?? null;
}

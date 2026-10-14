import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error.js";
import { ErrorCodes } from "../errors/codes.js";
import type { MembershipRole } from "../models/membership.model.js";

export function requireRole(allowedRoles: readonly MembershipRole[]) {
  const allowed = new Set(allowedRoles);

  return function requireRoleMiddleware(req: Request, _res: Response, next: NextFunction): void {
    const role = req.membership?.role;
    if (!role || !allowed.has(role)) {
      next(new AppError(ErrorCodes.FORBIDDEN, "You do not have permission to perform this action", 403));
      return;
    }

    next();
  };
}

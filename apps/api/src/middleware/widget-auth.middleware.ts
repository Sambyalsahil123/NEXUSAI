import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error.js";
import { ErrorCodes } from "../errors/codes.js";
import type { OrganizationService } from "../services/organization.service.js";

const PUBLISHABLE_KEY_HEADER = "x-publishable-key";

type WidgetTenantResolver = Pick<OrganizationService, "resolveByPublishableKey">;

export function createRequireWidgetAuth(organizationService: WidgetTenantResolver) {
  return async function requireWidgetAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const publishableKey = keyFrom(req);
    if (!publishableKey) {
      next(new AppError(ErrorCodes.UNAUTHORIZED, "Invalid or missing publishable key", 401));
      return;
    }

    try {
      req.organization = await organizationService.resolveByPublishableKey(publishableKey);
      next();
    } catch (error) {
      next(
        error instanceof AppError
          ? error
          : new AppError(ErrorCodes.UNAUTHORIZED, "Invalid or missing publishable key", 401),
      );
    }
  };
}

function keyFrom(req: Request): string | null {
  const header = req.header(PUBLISHABLE_KEY_HEADER)?.trim();
  if (header) {
    return header;
  }

  const query = req.query.key;
  if (typeof query === "string" && query.trim().length > 0) {
    return query.trim();
  }

  return null;
}

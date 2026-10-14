import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error.js";
import { ErrorCodes } from "../errors/codes.js";
import type { OrganizationService } from "../services/organization.service.js";

const ORGANIZATION_HEADER = "x-organization-id";

type TenantResolver = Pick<OrganizationService, "resolveTenant">;

export function createRequireTenant(organizationService: TenantResolver) {
  return async function requireTenant(req: Request, _res: Response, next: NextFunction): Promise<void> {
    if (!req.user) {
      next(new AppError(ErrorCodes.UNAUTHORIZED, "Authentication required", 401));
      return;
    }

    const organizationId = req.header(ORGANIZATION_HEADER)?.trim();
    if (!organizationId) {
      next(new AppError(ErrorCodes.VALIDATION_ERROR, "Organization id is required", 400));
      return;
    }

    try {
      const tenant = await organizationService.resolveTenant(req.user.id, organizationId);
      req.organization = tenant.organization;
      req.membership = tenant.membership;
      next();
    } catch (error) {
      next(
        error instanceof AppError
          ? error
          : new AppError(ErrorCodes.FORBIDDEN, "You do not have access to this organization", 403),
      );
    }
  };
}

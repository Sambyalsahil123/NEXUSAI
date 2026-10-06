import type { Request, Response } from "express";
import { AppError } from "../errors/app-error.js";
import { ErrorCodes } from "../errors/codes.js";
import type { OrganizationService } from "../services/organization.service.js";
import { getRequestId } from "../utils/request-id.js";
import { sendSuccess } from "../utils/http.js";
import { createOrganizationBodySchema } from "../validators/organization.validator.js";

type OrganizationApi = Pick<OrganizationService, "create" | "getUserOrganizations">;

export function createOrganizationController(organizationService: OrganizationApi) {
  return {
    async list(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        throw new AppError(ErrorCodes.UNAUTHORIZED, "Authentication required", 401);
      }

      const organizations = await organizationService.getUserOrganizations(req.user.id);
      sendSuccess(res, 200, organizations, getRequestId(req));
    },

    async create(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        throw new AppError(ErrorCodes.UNAUTHORIZED, "Authentication required", 401);
      }

      const body = createOrganizationBodySchema.safeParse(req.validated?.body);
      if (!body.success) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, "Request validation failed", 400);
      }

      const created = await organizationService.create(req.user.id, body.data);
      sendSuccess(res, 201, created, getRequestId(req));
    },
  };
}

import type { Request, Response } from "express";
import { AppError } from "../errors/app-error.js";
import { ErrorCodes } from "../errors/codes.js";
import type { AuthService } from "../services/auth.service.js";
import { getRequestId } from "../utils/request-id.js";
import { sendSuccess } from "../utils/http.js";
import { loginBodySchema, refreshTokenBodySchema, registerBodySchema } from "../validators/auth.validator.js";

export function createAuthController(authService: AuthService) {
  return {
    async register(req: Request, res: Response): Promise<void> {
      const body = registerBodySchema.safeParse(req.validated?.body);
      if (!body.success) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, "Request validation failed", 400);
      }

      const user = await authService.register(body.data);
      sendSuccess(res, 201, user, getRequestId(req));
    },

    async login(req: Request, res: Response): Promise<void> {
      const body = loginBodySchema.safeParse(req.validated?.body);
      if (!body.success) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, "Request validation failed", 400);
      }

      const result = await authService.login(body.data);
      sendSuccess(res, 200, result, getRequestId(req));
    },

    async refresh(req: Request, res: Response): Promise<void> {
      const body = refreshTokenBodySchema.safeParse(req.validated?.body);
      if (!body.success) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, "Request validation failed", 400);
      }

      const tokens = await authService.refresh(body.data.refreshToken);
      sendSuccess(res, 200, tokens, getRequestId(req));
    },

    async logout(req: Request, res: Response): Promise<void> {
      const body = refreshTokenBodySchema.safeParse(req.validated?.body);
      if (!body.success) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, "Request validation failed", 400);
      }

      await authService.logout(body.data.refreshToken);
      sendSuccess(res, 200, { revoked: true }, getRequestId(req));
    },

    async me(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        throw new AppError(ErrorCodes.UNAUTHORIZED, "Authentication required", 401);
      }
      sendSuccess(res, 200, req.user, getRequestId(req));
    },
  };
}

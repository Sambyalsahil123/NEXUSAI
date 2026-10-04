import type { Request, Response } from "express";
import { AppError } from "../errors/app-error.js";
import { ErrorCodes } from "../errors/codes.js";
import type { AuthService } from "../services/auth.service.js";
import { getRequestId } from "../utils/request-id.js";
import { sendSuccess } from "../utils/http.js";
import { loginBodySchema, registerBodySchema } from "../validators/auth.validator.js";

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
  };
}

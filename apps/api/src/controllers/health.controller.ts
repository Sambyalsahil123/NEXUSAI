import type { Request, Response } from "express";
import { ErrorCodes } from "../errors/codes.js";
import { getRequestId } from "../utils/request-id.js";
import type { HealthService } from "../services/health.service.js";
import { sendError, sendSuccess } from "../utils/http.js";

export function createHealthController(healthService: HealthService) {
  return {
    async getHealth(req: Request, res: Response): Promise<void> {
      const report = await healthService.check();
      if (report.status === "degraded") {
        sendError(
          res,
          503,
          {
            code: ErrorCodes.SERVICE_UNAVAILABLE,
            message: "MongoDB is unavailable",
          },
          getRequestId(req),
        );
        return;
      }

      sendSuccess(res, 200, report, getRequestId(req));
    },
  };
}

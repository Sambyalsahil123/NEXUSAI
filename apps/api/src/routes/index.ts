import { Router } from "express";
import type { AuthService } from "../services/auth.service.js";
import type { HealthService } from "../services/health.service.js";
import { createAuthRouter } from "./auth.routes.js";
import { createHealthRouter } from "./health.routes.js";

export function createApiRouter(healthService: HealthService, authService: AuthService): Router {
  const router = Router();
  router.use(createHealthRouter(healthService));
  router.use("/auth", createAuthRouter(authService));
  return router;
}

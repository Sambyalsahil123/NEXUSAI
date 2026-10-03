import { Router } from "express";
import type { HealthService } from "../services/health.service.js";
import { createHealthRouter } from "./health.routes.js";

export function createApiRouter(healthService: HealthService): Router {
  const router = Router();
  router.use(createHealthRouter(healthService));
  return router;
}

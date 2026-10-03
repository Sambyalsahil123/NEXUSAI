import { Router } from "express";
import { createHealthController } from "../controllers/health.controller.js";
import type { HealthService } from "../services/health.service.js";

export function createHealthRouter(healthService: HealthService): Router {
  const router = Router();
  const controller = createHealthController(healthService);

  router.get("/health", async (req, res) => {
    await controller.getHealth(req, res);
  });

  return router;
}

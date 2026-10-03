import express, { type Express } from "express";
import { pinoHttp } from "pino-http";
import { errorHandler } from "./middleware/error-handler.js";
import { notFound } from "./middleware/not-found.js";
import { requestId } from "./middleware/request-id.js";
import { applySecurity } from "./middleware/security.js";
import { createApiRouter } from "./routes/index.js";
import type { AuthService } from "./services/auth.service.js";
import type { HealthService } from "./services/health.service.js";
import type { Logger } from "./utils/logger.js";

export type AppDependencies = {
  healthService: HealthService;
  authService: AuthService;
  logger: Logger;
  corsOrigin: string;
};

export function createApp(deps: AppDependencies): Express {
  const app = express();

  app.use(requestId);
  app.use(
    pinoHttp({
      logger: deps.logger,
      genReqId: (req) => (typeof req.id === "string" ? req.id : "unknown"),
    }),
  );
  applySecurity(app, deps.corsOrigin);
  app.use(express.json({ limit: "1mb" }));

  app.use("/api/v1", createApiRouter(deps.healthService, deps.authService));

  app.use(notFound);
  app.use(errorHandler(deps.logger));

  return app;
}

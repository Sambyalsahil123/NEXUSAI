import cors from "cors";
import type { Express } from "express";
import helmet from "helmet";

export function applySecurity(app: Express, corsOrigin: string): void {
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: corsOrigin,
      allowedHeaders: ["Content-Type", "Authorization", "x-request-id"],
      exposedHeaders: ["x-request-id"],
    }),
  );
}

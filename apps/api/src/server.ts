import "dotenv/config";
import type { Server } from "node:http";
import type { MongoClient } from "mongodb";
import { createApp } from "./app.js";
import { parseEnv } from "./config/env.js";
import { connectMongo, disconnectMongo } from "./db/mongo.js";
import { ensureMembershipIndexes } from "./models/membership.model.js";
import { ensureOrganizationIndexes } from "./models/organization.model.js";
import { ensureSessionIndexes } from "./models/session.model.js";
import { ensureUserIndexes } from "./models/user.model.js";
import { HealthRepository } from "./repositories/health.repository.js";
import { SessionRepository } from "./repositories/session.repository.js";
import { UserRepository } from "./repositories/user.repository.js";
import { AuthService } from "./services/auth.service.js";
import { HealthService } from "./services/health.service.js";
import { createLogger } from "./utils/logger.js";

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
  const env = parseEnv(process.env);
  const logger = createLogger(env.LOG_LEVEL);

  let client: MongoClient;
  try {
    client = await connectMongo(env.MONGODB_URI);
    await ensureUserIndexes(client.db());
    await ensureSessionIndexes(client.db());
    await ensureOrganizationIndexes(client.db());
    await ensureMembershipIndexes(client.db());
  } catch (error) {
    logger.fatal({ err: error }, "failed to connect to MongoDB");
    process.exit(1);
  }

  logger.info("mongodb connected");

  const users = new UserRepository(client.db());
  const sessions = new SessionRepository(client.db());
  const healthService = new HealthService(new HealthRepository(client));
  const authService = new AuthService(users, sessions, env.JWT_SECRET);
  const app = createApp({
    healthService,
    authService,
    logger,
    corsOrigin: env.CORS_ORIGIN,
  });

  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info({ host: env.HOST, port: env.PORT }, "api listening");
  });

  server.on("error", (error) => {
    logger.fatal({ err: error }, "http server failed");
    process.exit(1);
  });

  registerShutdown(server, client, logger);
}

function registerShutdown(server: Server, client: MongoClient, logger: ReturnType<typeof createLogger>): void {
  let shuttingDown = false;

  const shutdown = (signal: string): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info({ signal }, "shutting down");

    const forceExit = setTimeout(() => {
      logger.error("shutdown timed out");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    server.close((closeError) => {
      if (closeError) {
        logger.error({ err: closeError }, "http server close failed");
      }

      disconnectMongo(client)
        .then(() => {
          process.exit(closeError ? 1 : 0);
        })
        .catch((error: unknown) => {
          logger.error({ err: error }, "mongodb disconnect failed");
          process.exit(1);
        });
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

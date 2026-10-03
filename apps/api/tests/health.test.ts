import { MongoMemoryServer } from "mongodb-memory-server";
import type { MongoClient } from "mongodb";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { connectMongo, disconnectMongo } from "../src/db/mongo.js";
import { HealthRepository } from "../src/repositories/health.repository.js";
import { AuthService } from "../src/services/auth.service.js";
import { HealthService } from "../src/services/health.service.js";
import { createLogger } from "../src/utils/logger.js";

const unusedAuthService = new AuthService({
  async findByEmail() {
    return null;
  },
  async createUser() {
    throw new Error("not used");
  },
});

describe("GET /api/v1/health", () => {
  let memoryServer: MongoMemoryServer;
  let client: MongoClient;

  beforeAll(async () => {
    memoryServer = await MongoMemoryServer.create();
    client = await connectMongo(memoryServer.getUri());
  }, 60_000);

  afterAll(async () => {
    await disconnectMongo(client);
    await memoryServer.stop();
  });

  it("reports ok when MongoDB answers ping", async () => {
    const app = createApp({
      healthService: new HealthService(new HealthRepository(client)),
      authService: unusedAuthService,
      logger: createLogger("silent"),
      corsOrigin: "http://localhost:3000",
    });

    const response = await request(app).get("/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual({ status: "ok", mongo: "up" });
    expect(response.body.meta.requestId).toEqual(expect.any(String));
  });

  it("returns 503 when MongoDB ping fails", async () => {
    const app = createApp({
      healthService: new HealthService({
        ping: async () => {
          throw new Error("connection refused");
        },
      }),
      authService: unusedAuthService,
      logger: createLogger("silent"),
      corsOrigin: "http://localhost:3000",
    });

    const response = await request(app).get("/api/v1/health");

    expect(response.status).toBe(503);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("SERVICE_UNAVAILABLE");
  });
});

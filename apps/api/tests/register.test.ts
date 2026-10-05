import { MongoMemoryServer } from "mongodb-memory-server";
import type { MongoClient } from "mongodb";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { connectMongo, disconnectMongo } from "../src/db/mongo.js";
import { ensureSessionIndexes } from "../src/models/session.model.js";
import { ensureUserIndexes } from "../src/models/user.model.js";
import { UserRepository } from "../src/repositories/user.repository.js";
import { SessionRepository } from "../src/repositories/session.repository.js";
import { AuthService } from "../src/services/auth.service.js";
import { HealthService } from "../src/services/health.service.js";
import { createLogger } from "../src/utils/logger.js";

describe("POST /api/v1/auth/register", () => {
  let memoryServer: MongoMemoryServer;
  let client: MongoClient;

  beforeAll(async () => {
    memoryServer = await MongoMemoryServer.create();
    client = await connectMongo(memoryServer.getUri());
    await ensureUserIndexes(client.db());
    await ensureSessionIndexes(client.db());
  }, 60_000);

  afterAll(async () => {
    await disconnectMongo(client);
    await memoryServer.stop();
  });

  function app() {
    return createApp({
      healthService: new HealthService({
        async ping() {
          return undefined;
        },
      }),
      authService: new AuthService(
        new UserRepository(client.db()),
        new SessionRepository(client.db()),
        "test-jwt-secret-that-is-32-characters-long",
      ),
      logger: createLogger("silent"),
      corsOrigin: "http://localhost:3000",
    });
  }

  it("creates a user and omits the password hash", async () => {
    const response = await request(app())
      .post("/api/v1/auth/register")
      .send({ email: "  Sahil@Nexus.ai ", password: "horse1234" });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.email).toBe("sahil@nexus.ai");
    expect(response.body.data.user.status).toBe("active");
    expect(response.body.data.user.passwordHash).toBeUndefined();
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(response.body.data.refreshToken).toEqual(expect.any(String));
    expect(JSON.stringify(response.body)).not.toContain("horse1234");
    expect(response.body.meta.requestId).toEqual(expect.any(String));
  });

  it("rejects a bad email and a weak password", async () => {
    const badEmail = await request(app()).post("/api/v1/auth/register").send({
      email: "not-an-email",
      password: "horse1234",
    });
    const weakPassword = await request(app()).post("/api/v1/auth/register").send({
      email: "owner@mobilestore.test",
      password: "longpassword",
    });

    expect(badEmail.status).toBe(400);
    expect(badEmail.body.error.code).toBe("VALIDATION_ERROR");
    expect(weakPassword.status).toBe(400);
    expect(weakPassword.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a second account with the same email", async () => {
    const body = { email: "owner@mobilestore.test", password: "horse1234" };
    const first = await request(app()).post("/api/v1/auth/register").send(body);
    const second = await request(app()).post("/api/v1/auth/register").send(body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("CONFLICT");
  });
});

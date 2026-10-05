import { MongoMemoryServer } from "mongodb-memory-server";
import type { MongoClient } from "mongodb";
import { decodeJwt } from "jose";
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

const JWT_SECRET = "test-jwt-secret-that-is-32-characters-long";

describe("POST /api/v1/auth/login", () => {
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
      authService: new AuthService(new UserRepository(client.db()), new SessionRepository(client.db()), JWT_SECRET),
      logger: createLogger("silent"),
      corsOrigin: "http://localhost:3000",
    });
  }

  it("returns a user and an access token for the correct password", async () => {
    await request(app()).post("/api/v1/auth/register").send({
      email: "owner@mobilestore.test",
      password: "horse1234",
    });

    const response = await request(app()).post("/api/v1/auth/login").send({
      email: "Owner@MobileStore.test",
      password: "horse1234",
    });

    expect(response.status).toBe(200);
    expect(response.body.data.user.email).toBe("owner@mobilestore.test");
    expect(response.body.data.user.passwordHash).toBeUndefined();
    expect(response.body.data.accessToken.split(".")).toHaveLength(3);

    const claims = decodeJwt(response.body.data.accessToken);
    expect(claims.sub).toBe(response.body.data.user.id);
    expect(JSON.stringify(claims)).not.toContain("horse1234");
  });

  it("returns the same 401 when the email is missing or the password is wrong", async () => {
    const missing = await request(app()).post("/api/v1/auth/login").send({
      email: "nobody@mobilestore.test",
      password: "horse1234",
    });
    const wrongPassword = await request(app()).post("/api/v1/auth/login").send({
      email: "owner@mobilestore.test",
      password: "horse9999",
    });

    expect(missing.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect(missing.body.error).toEqual({
      code: "UNAUTHORIZED",
      message: "Invalid email or password",
    });
    expect(wrongPassword.body.error).toEqual(missing.body.error);
  });

  it("rejects a malformed login body", async () => {
    const response = await request(app()).post("/api/v1/auth/login").send({
      email: "not-an-email",
      password: "",
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
});

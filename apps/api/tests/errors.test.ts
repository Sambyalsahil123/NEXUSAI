import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { HealthService } from "../src/services/health.service.js";
import { AuthService } from "../src/services/auth.service.js";
import { createLogger } from "../src/utils/logger.js";

function createTestApp(ping: () => Promise<void>) {
  return createApp({
    healthService: new HealthService({ ping }),
    authService: new AuthService(
      {
        async findByEmail() {
          return null;
        },
        async createUser() {
          throw new Error("not used");
        },
      },
      "test-jwt-secret-that-is-32-characters-long",
    ),
    logger: createLogger("silent"),
    corsOrigin: "http://localhost:3000",
  });
}

describe("error handling", () => {
  it("returns the standard envelope for an unknown route", async () => {
    const response = await request(createTestApp(async () => undefined)).get("/api/v1/missing");

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Route not found",
      },
    });
    expect(response.body.requestId).toEqual(expect.any(String));
    expect(response.headers["x-request-id"]).toBe(response.body.requestId);
  });

  it("rejects a body that is not JSON", async () => {
    const response = await request(createTestApp(async () => undefined))
      .post("/api/v1/health")
      .set("Content-Type", "application/json")
      .send("{");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
});

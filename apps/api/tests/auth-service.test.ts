import { describe, expect, it } from "vitest";
import { AuthService } from "../src/services/auth.service.js";

describe("AuthService.register duplicate key", () => {
  it("returns a conflict when insert loses a race on the unique email index", async () => {
    const service = new AuthService(
      {
        async findByEmail() {
          return null;
        },
        async findById() {
          return null;
        },
        async createUser() {
          throw Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
        },
      },
      {
        async issue() {
          throw new Error("not used");
        },
        async claimActive() {
          return null;
        },
        async findByRefreshToken() {
          return null;
        },
        async revokeFamily() {
          return undefined;
        },
        async revokeIfActive() {
          return undefined;
        },
      },
      "test-jwt-secret-that-is-32-characters-long",
    );

    await expect(service.register({ email: "owner@mobilestore.test", password: "horse1234" })).rejects.toMatchObject({
      code: "CONFLICT",
      statusCode: 409,
    });
  });
});

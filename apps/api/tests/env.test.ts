import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/config/env.js";

describe("parseEnv", () => {
  it("rejects a missing MongoDB URI", () => {
    expect(() => parseEnv({ NODE_ENV: "test" })).toThrow(/MONGODB_URI/);
  });

  it("applies defaults for a valid MongoDB URI", () => {
    const env = parseEnv({
      MONGODB_URI: "mongodb://localhost:27017/nexusai",
      JWT_SECRET: "test-jwt-secret-that-is-32-characters-long",
    });

    expect(env.PORT).toBe(4000);
    expect(env.HOST).toBe("0.0.0.0");
    expect(env.NODE_ENV).toBe("development");
    expect(env.CORS_ORIGIN).toBe("http://localhost:3000");
    expect(env.AI_PROVIDER).toBe("local");
    expect(env.OPENAI_EMBEDDING_MODEL).toBe("text-embedding-3-small");
    expect(env.OPENAI_CHAT_MODEL).toBe("gpt-4o-mini");
    expect(env.OPENAI_API_KEY).toBeUndefined();
  });

  it("rejects a JWT secret shorter than 32 characters", () => {
    expect(() =>
      parseEnv({
        MONGODB_URI: "mongodb://localhost:27017/nexusai",
        JWT_SECRET: "too-short",
      }),
    ).toThrow(/JWT_SECRET/);
  });

  it("rejects openai mode when the API key is missing", () => {
    expect(() =>
      parseEnv({
        MONGODB_URI: "mongodb://localhost:27017/nexusai",
        JWT_SECRET: "test-jwt-secret-that-is-32-characters-long",
        AI_PROVIDER: "openai",
        OPENAI_API_KEY: "  ",
      }),
    ).toThrow(/OPENAI_API_KEY is required when AI_PROVIDER is openai/);
  });
});

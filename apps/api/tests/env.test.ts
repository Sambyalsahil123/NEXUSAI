import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/config/env.js";

describe("parseEnv", () => {
  it("rejects a missing MongoDB URI", () => {
    expect(() => parseEnv({ NODE_ENV: "test" })).toThrow(/MONGODB_URI/);
  });

  it("applies defaults for a valid MongoDB URI", () => {
    const env = parseEnv({ MONGODB_URI: "mongodb://localhost:27017/nexusai" });

    expect(env.PORT).toBe(4000);
    expect(env.HOST).toBe("0.0.0.0");
    expect(env.NODE_ENV).toBe("development");
    expect(env.CORS_ORIGIN).toBe("http://localhost:3000");
  });
});

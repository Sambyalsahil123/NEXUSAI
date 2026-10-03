import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/utils/password.js";

describe("password hashing", () => {
  it("turns a plain password into an Argon2id hash", async () => {
    const passwordHash = await hashPassword("correct-horse");

    expect(passwordHash).not.toBe("correct-horse");
    expect(passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(passwordHash).toContain("m=19456,t=2,p=1");
  });

  it("produces a different hash each time because the salt is random", async () => {
    const first = await hashPassword("correct-horse");
    const second = await hashPassword("correct-horse");

    expect(first).not.toBe(second);
  });

  it("accepts the same password and rejects a different one", async () => {
    const passwordHash = await hashPassword("correct-horse");

    await expect(verifyPassword("correct-horse", passwordHash)).resolves.toBe(true);
    await expect(verifyPassword("wrong-horse", passwordHash)).resolves.toBe(false);
  });
});

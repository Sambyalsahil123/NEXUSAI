import { argon2id, hash, verify } from "argon2";

/** OWASP minimum for Argon2id: 19 MiB, 2 iterations, 1 lane. */
export const ARGON2_MEMORY_COST_KIB = 19_456;
export const ARGON2_TIME_COST = 2;
export const ARGON2_PARALLELISM = 1;

const hashOptions = {
  type: argon2id,
  memoryCost: ARGON2_MEMORY_COST_KIB,
  timeCost: ARGON2_TIME_COST,
  parallelism: ARGON2_PARALLELISM,
} as const;

export async function hashPassword(password: string): Promise<string> {
  if (password.length === 0) {
    throw new Error("Password must not be empty");
  }

  return hash(password, hashOptions);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  if (password.length === 0 || passwordHash.length === 0) {
    return false;
  }

  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

import { jwtVerify, SignJWT } from "jose";

/** 15 minutes. Short so a stolen access token stops working quickly. */
export const ACCESS_TOKEN_TTL = "15m";

export async function signAccessToken(userId: string, secret: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(key(secret));
}

export async function verifyAccessToken(token: string, secret: string): Promise<string> {
  const { payload } = await jwtVerify(token, key(secret), { algorithms: ["HS256"] });
  if (!payload.sub) {
    throw new Error("Access token is missing sub");
  }
  return payload.sub;
}

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

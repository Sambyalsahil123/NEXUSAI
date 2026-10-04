import { SignJWT } from "jose";

/** 15 minutes. Short so a stolen access token stops working quickly. */
export const ACCESS_TOKEN_TTL = "15m";

export async function signAccessToken(userId: string, secret: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(new TextEncoder().encode(secret));
}

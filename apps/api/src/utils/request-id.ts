import type { Request } from "express";

export function getRequestId(req: Request): string {
  return typeof req.id === "string" ? req.id : "unknown";
}

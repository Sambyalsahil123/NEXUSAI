import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const SAFE_REQUEST_ID = /^[A-Za-z0-9-]{1,64}$/;

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const header = req.header("x-request-id");
  const id = header && SAFE_REQUEST_ID.test(header) ? header : randomUUID();
  req.id = id;
  res.setHeader("x-request-id", id);
  next();
}

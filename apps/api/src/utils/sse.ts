import type { Response } from "express";

export type SseTokenEvent = { type: "token"; content: string };
export type SseSourcesEvent = {
  type: "sources";
  sources: { documentId: string; title: string; score: number }[];
};
export type SseDoneEvent = { type: "done" };
export type SseEvent = SseTokenEvent | SseSourcesEvent | SseDoneEvent;

/**
 * Node omits Content-Length, so HTTP/1.1 sends this body with chunked transfer encoding.
 * Call this only after auth and tenant checks, so a 404 can still be a normal JSON response.
 */
export function beginSse(res: Response): void {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
}

export function writeSseEvent(res: Response, event: SseEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

import type { Response } from "express";
import type { AnswerSource } from "../services/rag.service.js";
import { beginSse, writeSseEvent } from "./sse.js";

class StreamAbortedError extends Error {
  constructor() {
    super("Client disconnected");
    this.name = "StreamAbortedError";
  }
}

export async function writeConversationStream(
  res: Response,
  produce: (onChunk: (token: string) => void) => Promise<{ sources: AnswerSource[] }>,
): Promise<void> {
  let aborted = false;
  let completed = false;
  res.on("close", () => {
    if (!completed) {
      aborted = true;
    }
  });
  res.on("error", () => {
    aborted = true;
  });

  const onChunk = (token: string) => {
    if (aborted || res.writableEnded) {
      throw new StreamAbortedError();
    }
    if (!res.headersSent) {
      beginSse(res);
    }
    try {
      writeSseEvent(res, { type: "token", content: token });
    } catch {
      aborted = true;
      throw new StreamAbortedError();
    }
  };

  try {
    const turn = await produce(onChunk);
    if (aborted || res.writableEnded) {
      if (!res.writableEnded) {
        completed = true;
        res.end();
      }
      return;
    }
    if (!res.headersSent) {
      beginSse(res);
    }
    writeSseEvent(res, { type: "sources", sources: turn.sources });
    writeSseEvent(res, { type: "done" });
    completed = true;
    res.end();
  } catch (error) {
    if (error instanceof StreamAbortedError || aborted) {
      if (!res.writableEnded) {
        completed = true;
        res.end();
      }
      return;
    }
    if (res.headersSent) {
      if (!res.writableEnded) {
        completed = true;
        res.end();
      }
      return;
    }
    throw error;
  }
}

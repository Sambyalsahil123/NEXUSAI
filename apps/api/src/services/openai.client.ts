import OpenAI from "openai";
import { EMBEDDING_DIMENSIONS } from "./embedding.service.js";

export type OpenAiChatMessage = {
  role: "system" | "user";
  content: string;
};

export type OpenAiChatBody = {
  model: string;
  messages: OpenAiChatMessage[];
};

export type OpenAiChatStreamEvent = {
  choices: Array<{ delta?: { content?: string | null } }>;
};

export type OpenAiChatCompletion = {
  choices: Array<{ message?: { content?: string | null } }>;
};

export type OpenAiEmbeddingResponse = {
  data: Array<{ embedding?: number[] }>;
};

/**
 * The slice of the OpenAI SDK this process uses.
 * Tests pass a fake. Production uses createOpenAiClient.
 */
export type OpenAiApi = {
  embeddings: {
    create(body: { model: string; input: string; dimensions: number }): Promise<OpenAiEmbeddingResponse>;
  };
  chat: {
    completions: {
      create(body: OpenAiChatBody & { stream: true }): Promise<AsyncIterable<OpenAiChatStreamEvent>>;
      create(body: OpenAiChatBody): Promise<OpenAiChatCompletion>;
    };
  };
};

export function createOpenAiClient(apiKey: string): OpenAiApi {
  const client = new OpenAI({ apiKey });

  async function createChat(body: OpenAiChatBody & { stream: true }): Promise<AsyncIterable<OpenAiChatStreamEvent>>;
  async function createChat(body: OpenAiChatBody): Promise<OpenAiChatCompletion>;
  async function createChat(
    body: OpenAiChatBody & { stream?: true },
  ): Promise<AsyncIterable<OpenAiChatStreamEvent> | OpenAiChatCompletion> {
    if (body.stream) {
      return client.chat.completions.create({
        model: body.model,
        messages: body.messages,
        stream: true,
      });
    }

    return client.chat.completions.create({
      model: body.model,
      messages: body.messages,
    });
  }

  return {
    embeddings: {
      create(body) {
        return client.embeddings.create({
          model: body.model,
          input: body.input,
          dimensions: body.dimensions ?? EMBEDDING_DIMENSIONS,
          encoding_format: "float",
        });
      },
    },
    chat: {
      completions: {
        create: createChat,
      },
    },
  };
}

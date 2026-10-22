import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/config/env.js";
import { createAiProviders } from "../src/services/ai-provider.factory.js";
import { EMBEDDING_DIMENSIONS, LocalEmbeddingService } from "../src/services/embedding.service.js";
import { LocalLanguageModelService } from "../src/services/llm.service.js";
import { OpenAiEmbeddingService } from "../src/services/openai-embedding.service.js";
import { OpenAiLanguageModelService } from "../src/services/openai-llm.service.js";
import type { OpenAiApi, OpenAiChatBody, OpenAiChatStreamEvent } from "../src/services/openai.client.js";

const BASE_ENV = {
  MONGODB_URI: "mongodb://localhost:27017/nexusai",
  JWT_SECRET: "test-jwt-secret-that-is-32-characters-long",
};

describe("createAiProviders", () => {
  it("uses the local adapters when AI_PROVIDER is omitted", () => {
    const providers = createAiProviders(parseEnv(BASE_ENV));

    expect(providers.embeddings).toBeInstanceOf(LocalEmbeddingService);
    expect(providers.languageModel).toBeInstanceOf(LocalLanguageModelService);
  });

  it("keeps the local adapters when a key is present but the provider is local", () => {
    const providers = createAiProviders(
      parseEnv({
        ...BASE_ENV,
        AI_PROVIDER: "local",
        OPENAI_API_KEY: "sk-test-key",
      }),
    );

    expect(providers.embeddings).toBeInstanceOf(LocalEmbeddingService);
    expect(providers.languageModel).toBeInstanceOf(LocalLanguageModelService);
  });

  it("builds the OpenAI adapters when openai is configured with a key", () => {
    const providers = createAiProviders(
      parseEnv({
        ...BASE_ENV,
        AI_PROVIDER: "openai",
        OPENAI_API_KEY: "sk-test-key",
        OPENAI_CHAT_MODEL: "gpt-4o-mini",
        OPENAI_EMBEDDING_MODEL: "text-embedding-3-small",
      }),
      fakeClient(),
    );

    expect(providers.embeddings).toBeInstanceOf(OpenAiEmbeddingService);
    expect(providers.languageModel).toBeInstanceOf(OpenAiLanguageModelService);
  });

  it("refuses to build OpenAI adapters without an API key", () => {
    expect(() =>
      createAiProviders({
        ...parseEnv(BASE_ENV),
        AI_PROVIDER: "openai",
        OPENAI_API_KEY: undefined,
      }),
    ).toThrow("OPENAI_API_KEY is required when AI_PROVIDER is openai");
  });
});

describe("OpenAI adapters", () => {
  it("turns stream deltas into onChunk calls and returns the joined text", async () => {
    const bodies: Array<OpenAiChatBody & { stream?: true }> = [];
    const client = fakeClient({
      stream: async function* () {
        yield { choices: [{ delta: { content: "Alpha " } }] };
        yield { choices: [{ delta: { content: null } }] };
        yield { choices: [{}] };
        yield { choices: [{ delta: { content: "phones" } }] };
      },
      onChat: (body) => {
        bodies.push(body);
      },
    });
    const service = new OpenAiLanguageModelService(client, "gpt-4o-mini");
    const chunks: string[] = [];

    const reply = await service.generateStream("system", "What warranty?", (token) => {
      chunks.push(token);
    });

    expect(bodies[0]).toMatchObject({
      model: "gpt-4o-mini",
      stream: true,
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "What warranty?" },
      ],
    });
    expect(chunks).toEqual(["Alpha ", "phones"]);
    expect(reply).toBe("Alpha phones");
  });

  it("returns the full completion when streaming is off", async () => {
    const service = new OpenAiLanguageModelService(
      fakeClient({ completion: "Alpha phones include a thirty day warranty." }),
      "gpt-4o-mini",
    );

    await expect(service.generateResponse("system", "question")).resolves.toBe(
      "Alpha phones include a thirty day warranty.",
    );
  });

  it("stores a 1536-dimensional unit vector from the embedding response", async () => {
    const raw = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) => (index === 0 ? 4 : 0));
    let dimensions = 0;
    const service = new OpenAiEmbeddingService(
      fakeClient({
        embedding: raw,
        onEmbed: (body) => {
          dimensions = body.dimensions;
        },
      }),
      "text-embedding-3-small",
    );

    const vector = await service.generateEmbedding("warranty");
    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

    expect(dimensions).toBe(EMBEDDING_DIMENSIONS);
    expect(vector).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(magnitude).toBeCloseTo(1, 5);
    expect(vector[0]).toBeCloseTo(1, 5);
  });
});

function fakeClient(options?: {
  stream?: () => AsyncIterable<OpenAiChatStreamEvent>;
  completion?: string;
  embedding?: number[];
  onChat?: (body: OpenAiChatBody & { stream?: true }) => void;
  onEmbed?: (body: { model: string; input: string; dimensions: number }) => void;
}): OpenAiApi {
  return {
    embeddings: {
      async create(body) {
        options?.onEmbed?.(body);
        return { data: [{ embedding: options?.embedding ?? [] }] };
      },
    },
    chat: {
      completions: {
        async create(body: OpenAiChatBody & { stream?: true }) {
          options?.onChat?.(body);
          if (body.stream) {
            return options?.stream?.() ?? emptyStream();
          }
          return { choices: [{ message: { content: options?.completion ?? "" } }] };
        },
      },
    },
  };
}

async function* emptyStream(): AsyncIterable<OpenAiChatStreamEvent> {
  yield { choices: [] };
}

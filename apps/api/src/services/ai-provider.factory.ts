import type { Env } from "../config/env.js";
import { LocalEmbeddingService, type IEmbeddingService } from "./embedding.service.js";
import { LocalLanguageModelService, type ILanguageModelService } from "./llm.service.js";
import { OpenAiEmbeddingService } from "./openai-embedding.service.js";
import { OpenAiLanguageModelService } from "./openai-llm.service.js";
import { createOpenAiClient, type OpenAiApi } from "./openai.client.js";

export type AiProviders = {
  embeddings: IEmbeddingService;
  languageModel: ILanguageModelService;
};

/**
 * local keeps tests and development deterministic.
 * openai is constructed only when the provider is selected and a key is present.
 */
export function createAiProviders(env: Env, client?: OpenAiApi): AiProviders {
  if (env.AI_PROVIDER === "local") {
    return {
      embeddings: new LocalEmbeddingService(),
      languageModel: new LocalLanguageModelService(),
    };
  }

  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required when AI_PROVIDER is openai");
  }

  const openai = client ?? createOpenAiClient(env.OPENAI_API_KEY);
  return {
    embeddings: new OpenAiEmbeddingService(openai, env.OPENAI_EMBEDDING_MODEL),
    languageModel: new OpenAiLanguageModelService(openai, env.OPENAI_CHAT_MODEL),
  };
}

import { z } from "zod";

function blankToUndefined(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    HOST: z.string().min(1).default("0.0.0.0"),
    MONGODB_URI: z.string().min(1),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    CORS_ORIGIN: z.string().min(1).default("http://localhost:3000"),
    JWT_SECRET: z.string().min(32),
    AI_PROVIDER: z.enum(["local", "openai"]).default("local"),
    OPENAI_API_KEY: z.preprocess(blankToUndefined, z.string().min(1).optional()),
    OPENAI_EMBEDDING_MODEL: z.preprocess(blankToUndefined, z.string().min(1).default("text-embedding-3-small")),
    OPENAI_CHAT_MODEL: z.preprocess(blankToUndefined, z.string().min(1).default("gpt-4o-mini")),
  })
  .superRefine((env, ctx) => {
    if (env.AI_PROVIDER === "openai" && !env.OPENAI_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["OPENAI_API_KEY"],
        message: "OPENAI_API_KEY is required when AI_PROVIDER is openai",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, unknown>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${message}`);
  }
  return result.data;
}

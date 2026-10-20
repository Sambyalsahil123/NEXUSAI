/**
 * The only acceptable reply when the supplied context does not contain the fact.
 * A provider model is instructed to say this. The local adapter returns it directly.
 */
export const INSUFFICIENT_KNOWLEDGE_REPLY =
  "I do not have enough information to answer that question based on the provided knowledge.";

export interface ILanguageModelService {
  generateResponse(systemPrompt: string, userQuery: string): Promise<string>;
  generateStream(systemPrompt: string, userQuery: string, onChunk: (token: string) => void): Promise<string>;
}

const STOP_WORDS = new Set([
  "what",
  "when",
  "where",
  "which",
  "does",
  "have",
  "that",
  "this",
  "with",
  "from",
  "your",
  "about",
  "would",
  "could",
  "should",
  "there",
  "their",
  "into",
  "only",
  "based",
]);

/**
 * Deterministic stand-in for a provider chat model.
 * It can only quote a sentence from the Context section of the system prompt.
 */
export class LocalLanguageModelService implements ILanguageModelService {
  async generateResponse(systemPrompt: string, userQuery: string): Promise<string> {
    return this.generateStream(systemPrompt, userQuery, () => undefined);
  }

  async generateStream(systemPrompt: string, userQuery: string, onChunk: (token: string) => void): Promise<string> {
    const fullText = replyFrom(systemPrompt, userQuery);
    for (const token of streamChunks(fullText)) {
      onChunk(token);
    }
    return fullText;
  }
}

function replyFrom(systemPrompt: string, userQuery: string): string {
  const context = contextOf(systemPrompt);
  if (context.length === 0 || context === "(no context)") {
    return INSUFFICIENT_KNOWLEDGE_REPLY;
  }

  const questionWords = [...new Set([...words(userQuery), ...words(historyOf(systemPrompt))])];
  let bestSentence = "";
  let bestScore = 0;
  for (const sentence of sentences(context)) {
    const score = questionWords.filter((word) => sentence.toLowerCase().includes(word)).length;
    if (score > bestScore) {
      bestScore = score;
      bestSentence = sentence;
    }
  }

  if (bestScore === 0) {
    return INSUFFICIENT_KNOWLEDGE_REPLY;
  }

  return bestSentence;
}

/** Whitespace is its own chunk so joining the chunks reproduces the full reply. */
function streamChunks(text: string): string[] {
  return text.split(/(\s+)/).filter((part) => part.length > 0);
}

function historyOf(systemPrompt: string): string {
  const marker = "History:\n";
  const start = systemPrompt.lastIndexOf(marker);
  if (start === -1) {
    return "";
  }
  const rest = systemPrompt.slice(start + marker.length);
  const contextAt = rest.indexOf("\nContext:\n");
  const history = (contextAt === -1 ? rest : rest.slice(0, contextAt)).trim();
  if (history === "(no history)") {
    return "";
  }
  return history;
}

function contextOf(systemPrompt: string): string {
  const marker = "Context:\n";
  const start = systemPrompt.lastIndexOf(marker);
  if (start === -1) {
    return "";
  }
  return systemPrompt.slice(start + marker.length).trim();
}

function sentences(context: string): string[] {
  return context
    .split(/\n+|(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4 && !STOP_WORDS.has(word));
}

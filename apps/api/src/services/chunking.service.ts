import type { KnowledgeChunkMetadata } from "../models/chunk.model.js";
import type { KnowledgeCategory } from "../models/knowledge.model.js";

/** Article text per chunk. The context header is added after the window is chosen. */
export const CHUNK_MAX_CHARS = 800;
export const CHUNK_OVERLAP_CHARS = 100;

export type ChunkSource = {
  organizationId: string;
  documentId: string;
  title: string;
  category: KnowledgeCategory;
  content: string;
};

export type KnowledgeChunkDraft = {
  organizationId: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  metadata: KnowledgeChunkMetadata;
};

export function knowledgeChunkHeader(category: string, title: string): string {
  return `[Category: ${category} | Title: ${title}]`;
}

export function chunkKnowledge(source: ChunkSource): KnowledgeChunkDraft[] {
  const headerContext = knowledgeChunkHeader(source.category, source.title);
  const windows = splitWindows(source.content);

  return windows.map((text, chunkIndex) => ({
    organizationId: source.organizationId,
    documentId: source.documentId,
    chunkIndex,
    content: `${headerContext}\n${text}`,
    metadata: {
      category: source.category,
      title: source.title,
      headerContext,
    },
  }));
}

function splitWindows(content: string): string[] {
  const pieces = piecesOf(content);
  if (pieces.length === 0) {
    return [];
  }

  const windows: string[] = [];
  let start = 0;

  while (start < pieces.length) {
    let end = start;
    let length = 0;

    while (end < pieces.length) {
      const piece = pieces[end] ?? "";
      const nextLength = length === 0 ? piece.length : length + 1 + piece.length;
      if (nextLength > CHUNK_MAX_CHARS && length > 0) {
        break;
      }
      length = nextLength;
      end += 1;
    }

    if (end === start) {
      end = start + 1;
    }

    windows.push(pieces.slice(start, end).join(" "));
    if (end >= pieces.length) {
      break;
    }

    const nextStart = overlapStart(pieces, start, end);
    start = nextStart > start ? nextStart : end;
  }

  return windows;
}

function piecesOf(content: string): string[] {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const pieces: string[] = [];
  for (const paragraph of normalized.split(/\n{2,}/)) {
    const sentences = paragraph
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 0);
    const units = sentences.length > 0 ? sentences : [paragraph.trim()].filter((sentence) => sentence.length > 0);

    for (const unit of units) {
      if (unit.length <= CHUNK_MAX_CHARS) {
        pieces.push(unit);
      } else {
        pieces.push(...splitLongText(unit));
      }
    }
  }

  return pieces;
}

function splitLongText(text: string): string[] {
  const parts: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + CHUNK_MAX_CHARS, text.length);
    if (end < text.length) {
      const space = text.lastIndexOf(" ", end);
      if (space > start + CHUNK_OVERLAP_CHARS) {
        end = space;
      }
    }

    const part = text.slice(start, end).trim();
    if (part.length > 0) {
      parts.push(part);
    }
    if (end >= text.length) {
      break;
    }

    const next = end - CHUNK_OVERLAP_CHARS;
    start = next > start ? next : end;
  }

  return parts;
}

function overlapStart(pieces: string[], chunkStart: number, chunkEnd: number): number {
  let length = 0;
  let index = chunkEnd;

  while (index > chunkStart) {
    const piece = pieces[index - 1] ?? "";
    const nextLength = length === 0 ? piece.length : length + 1 + piece.length;
    if (length > 0 && nextLength > CHUNK_OVERLAP_CHARS) {
      break;
    }
    length = nextLength;
    index -= 1;
    if (length >= CHUNK_OVERLAP_CHARS) {
      break;
    }
  }

  if (index <= chunkStart) {
    return chunkEnd;
  }

  return index;
}

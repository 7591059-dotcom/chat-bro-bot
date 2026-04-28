import type { ChatMemory, ChatTurn, MemoryItem } from "./types.js";

interface RetrievalResult {
  memories: MemoryItem[];
  short: ChatTurn[];
}

const STOP_WORDS = new Set([
  "и",
  "в",
  "во",
  "на",
  "по",
  "что",
  "это",
  "как",
  "а",
  "но",
  "ну",
  "же",
  "ли",
  "или",
  "the",
  "and",
  "for",
  "with",
]);

export function retrieveMemory(chat: ChatMemory, query: string, maxItems: number): RetrievalResult {
  const queryTerms = terms(query);
  const scored = chat.items
    .map((item) => ({ item, score: scoreItem(item, queryTerms) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxItems)
    .map(({ item }) => item);

  const profile = chat.items
    .filter((item) => item.layer === "profile" || item.layer === "summary")
    .slice(-3);

  const merged = uniqueById([...profile, ...scored]).slice(0, maxItems);
  return {
    memories: merged,
    short: chat.short.slice(-8),
  };
}

export function formatMemoryContext(result: RetrievalResult): string {
  const parts: string[] = [];

  if (result.memories.length > 0) {
    parts.push("Релевантная долгосрочная память:");
    for (const item of result.memories) {
      const who = item.userName ? ` (${item.userName})` : "";
      parts.push(`- [${item.layer}${who}] ${item.text}`);
    }
  }

  if (result.short.length > 0) {
    parts.push("Последние реплики:");
    for (const turn of result.short) {
      const who = turn.role === "assistant" ? "бот" : turn.userName ?? "участник";
      parts.push(`- ${who}: ${turn.text}`);
    }
  }

  return parts.join("\n");
}

function scoreItem(item: MemoryItem, queryTerms: Set<string>): number {
  if (queryTerms.size === 0) return item.layer === "profile" ? 1 : 0;

  const itemTerms = terms(`${item.text} ${item.tags.join(" ")}`);
  let score = 0;
  for (const term of queryTerms) {
    if (itemTerms.has(term)) score += 2;
    for (const itemTerm of itemTerms) {
      if (itemTerm.length >= 5 && (itemTerm.includes(term) || term.includes(itemTerm))) {
        score += 0.5;
      }
    }
  }

  if (item.layer === "person") score += 0.75;
  if (item.layer === "fact") score += 0.5;
  return score * item.confidence;
}

function terms(input: string): Set<string> {
  return new Set(
    input
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_-]+/gu, " ")
      .split(/\s+/)
      .map((term) => term.trim())
      .filter((term) => term.length > 2 && !STOP_WORDS.has(term)),
  );
}

function uniqueById(items: MemoryItem[]): MemoryItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

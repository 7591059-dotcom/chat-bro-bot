import type { MemoryStore } from "./store.js";
import type { MemoryItem } from "./types.js";

interface Author {
  id: number;
  name: string;
}

const EXPLICIT_REMEMBER = /(?:^|\s)(?:запомни|запиши|не забудь|сохрани)(?:,|:)?\s+(.+)/i;
const NAME_FACT = /(?:меня зовут|я\s+—|я\s+-)\s+(.{2,80})/i;
const PREFERENCE = /(?:я люблю|мне нравится|я предпочитаю|мне удобнее|я не люблю)\s+(.{2,160})/i;
const PROJECT_FACT = /(?:проект называется|наш проект|репозиторий называется)\s+(.{2,160})/i;

export function learnFromMessage(store: MemoryStore, chatId: string, author: Author, text: string): MemoryItem[] {
  const learned: MemoryItem[] = [];
  const cleaned = text.trim();

  const explicit = cleaned.match(EXPLICIT_REMEMBER)?.[1]?.trim();
  if (explicit) {
    learned.push(
      store.addMemory(chatId, {
        layer: "fact",
        text: explicit,
        tags: ["explicit"],
        userId: author.id,
        userName: author.name,
        confidence: 0.95,
        source: "remember",
      }),
    );
  }

  const name = cleaned.match(NAME_FACT)?.[1]?.trim();
  if (name) {
    learned.push(
      store.addMemory(chatId, {
        layer: "person",
        text: `${author.name}: ${name}`,
        tags: ["person", "name"],
        userId: author.id,
        userName: author.name,
        confidence: 0.85,
        source: "auto",
      }),
    );
  }

  const preference = cleaned.match(PREFERENCE)?.[0]?.trim();
  if (preference) {
    learned.push(
      store.addMemory(chatId, {
        layer: "person",
        text: `${author.name}: ${preference}`,
        tags: ["person", "preference"],
        userId: author.id,
        userName: author.name,
        confidence: 0.75,
        source: "auto",
      }),
    );
  }

  const project = cleaned.match(PROJECT_FACT)?.[0]?.trim();
  if (project) {
    learned.push(
      store.addMemory(chatId, {
        layer: "fact",
        text: project,
        tags: ["project"],
        userId: author.id,
        userName: author.name,
        confidence: 0.75,
        source: "auto",
      }),
    );
  }

  return learned;
}

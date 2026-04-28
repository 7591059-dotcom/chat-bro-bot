export type MemoryLayer = "profile" | "fact" | "person" | "episode" | "summary" | "commitment";

export interface MemoryItem {
  id: string;
  layer: MemoryLayer;
  text: string;
  tags: string[];
  userId?: number;
  userName?: string;
  confidence: number;
  createdAt: string;
  updatedAt: string;
  source?: string;
}

export interface ChatSettings {
  triggers: string[];
  persona: string;
  imageEnabled: boolean;
  memoryEnabled: boolean;
}

export interface ChatTurn {
  role: "user" | "assistant";
  userId?: number;
  userName?: string;
  text: string;
  at: string;
}

export interface Reminder {
  id: string;
  chatId: string;
  userId: number;
  userName: string;
  text: string;
  dueAt: string;
  createdAt: string;
  sentAt?: string;
}

export interface ChatMemory {
  settings: ChatSettings;
  short: ChatTurn[];
  items: MemoryItem[];
  reminders: Reminder[];
}

export interface MemoryDb {
  version: 1;
  chats: Record<string, ChatMemory>;
}

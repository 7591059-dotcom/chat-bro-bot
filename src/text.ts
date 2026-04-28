const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\bsk-proj-[A-Za-z0-9_-]{20,}\b/g,
  /\bsk-hub-[A-Za-z0-9_-]{20,}\b/g,
  /\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g,
  /\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{20,}\b/g,
];

export function redactSecrets(input: string): string {
  return SECRET_PATTERNS.reduce((text, pattern) => text.replace(pattern, "[redacted-secret]"), input);
}

export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function truncate(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input;
  return `${input.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

export function splitTelegramMessage(input: string, maxChars = 3900): string[] {
  if (input.length <= maxChars) return [input];
  const parts: string[] = [];
  let rest = input;

  while (rest.length > maxChars) {
    const window = rest.slice(0, maxChars);
    const cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf("\n"), window.lastIndexOf(". "));
    const index = cut > maxChars * 0.5 ? cut + 1 : maxChars;
    parts.push(rest.slice(0, index).trim());
    rest = rest.slice(index).trim();
  }

  if (rest) parts.push(rest);
  return parts;
}

export function displayName(user: { first_name?: string; last_name?: string; username?: string }): string {
  const full = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return full || (user.username ? `@${user.username}` : "unknown");
}

export function nowIso(): string {
  return new Date().toISOString();
}

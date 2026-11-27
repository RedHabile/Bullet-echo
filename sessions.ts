import { randomUUID } from "crypto";

export interface Session {
  code: string;
  hostToken: string;
  guestToken: string | null;
  hostRole: "survivor" | "killer";
  started: boolean;
  createdAt: number;
  lastHost: number;
  lastGuest: number;
  q: { host: Record<string, unknown>[]; guest: Record<string, unknown>[] };
  listen: { host: ((m: Record<string, unknown>) => void) | null; guest: ((m: Record<string, unknown>) => void) | null };
}

const g = globalThis as typeof globalThis & { __hollowSessions?: Map<string, Session> };
export const sessions: Map<string, Session> = g.__hollowSessions ?? new Map();
g.__hollowSessions = sessions;

export function sweep() {
  const now = Date.now();
  for (const [code, s] of sessions) {
    const idle = now - Math.max(s.lastHost, s.lastGuest);
    if (idle > 120_000 || now - s.createdAt > 3_600_000) sessions.delete(code);
  }
  if (sessions.size > 300) {
    const oldest = [...sessions.values()].sort((a, b) => a.createdAt - b.createdAt);
    for (let i = 0; i < sessions.size - 300; i++) sessions.delete(oldest[i].code);
  }
}

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function makeCode(): string {
  for (let attempt = 0; attempt < 40; attempt++) {
    let c = "";
    for (let i = 0; i < 4; i++) c += ALPHABET[(Math.random() * ALPHABET.length) | 0];
    if (!sessions.has(c)) return c;
  }
  return randomUUID().slice(0, 4).toUpperCase();
}

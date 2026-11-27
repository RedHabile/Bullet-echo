// Local high-score table persisted in localStorage.
import type { Mode } from "./types";

export interface ScoreEntry {
  name: string;
  score: number;
  mode: Mode;
  wave: number;
  date: number;
}

const KEY = "bullet-echo:highscores:v1";
export const MAX_SCORES = 10;

export function loadScores(): ScoreEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .filter((e): e is ScoreEntry => {
        const x = e as ScoreEntry;
        return (
          typeof x?.name === "string" &&
          typeof x?.score === "number" &&
          typeof x?.wave === "number" &&
          typeof x?.date === "number" &&
          (x.mode === "solo" || x.mode === "duel")
        );
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_SCORES);
  } catch {
    return [];
  }
}

export function qualifies(score: number, list: ScoreEntry[]): boolean {
  if (score <= 0) return false;
  if (list.length < MAX_SCORES) return true;
  return score > list[list.length - 1].score;
}

export function saveScore(entry: ScoreEntry): ScoreEntry[] {
  const list = loadScores();
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const trimmed = list.slice(0, MAX_SCORES);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    // storage full or unavailable: keep in-memory result only
  }
  return trimmed;
}

export function clearScores() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

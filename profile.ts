// Local player profile: coins, owned skins, boosters, daily orders (quests), streak and lifetime stats.
import { BOOSTER_MAX, BOOSTERS, SKINS, type BoosterId } from "./skins";
import type { RunSummary } from "./types";

export type Metric = "kills" | "echo" | "grazes" | "combo" | "score" | "time" | "wave" | "runs" | "duelWin";

export interface QuestDef {
  id: string;
  title: string;
  detail: string;
  metric: Metric;
  type: "sum" | "max";
  target: number;
  reward: number;
}

export const QUEST_POOL: QuestDef[] = [
  { id: "kills", title: "Pest control", detail: "Destroy enemies across your runs", metric: "kills", type: "sum", target: 30, reward: 120 },
  { id: "echo", title: "Echo chamber", detail: "Land kills with bounced shots", metric: "echo", type: "sum", target: 10, reward: 150 },
  { id: "grazes", title: "Close shave", detail: "Graze enemy bullets", metric: "grazes", type: "sum", target: 25, reward: 100 },
  { id: "combo", title: "Unbroken", detail: "Reach a kill combo in one run", metric: "combo", type: "max", target: 10, reward: 140 },
  { id: "score", title: "Big numbers", detail: "Score points in a single run", metric: "score", type: "max", target: 8000, reward: 160 },
  { id: "survive", title: "Hold the line", detail: "Survive for seconds in one run", metric: "time", type: "max", target: 60, reward: 130 },
  { id: "runs", title: "Regular", detail: "Finish runs", metric: "runs", type: "sum", target: 3, reward: 90 },
  { id: "duel", title: "First blood", detail: "Win a duel as P1", metric: "duelWin", type: "sum", target: 1, reward: 180 },
  { id: "wave", title: "Escalation", detail: "Reach a wave in one run", metric: "wave", type: "max", target: 4, reward: 140 },
];

export interface QuestState {
  id: string;
  progress: number;
  claimed: boolean;
}

export interface Stats {
  runs: number;
  kills: number;
  echo: number;
  grazes: number;
  bestCombo: number;
  bestScore: number;
  bestWave: number;
  playSec: number;
  duelWins: number;
}

export interface Profile {
  version: number;
  coins: number;
  owned: string[];
  equipped: string;
  boosters: Record<BoosterId, number>;
  stats: Stats;
  streak: number;
  lastDay: string;
  bonusDay: string;
  quests: { day: string; items: QuestState[] };
}

export interface RunReward {
  score: number;
  runCoins: number;
  firstBonus: number;
  completed: string[];
  streak: number;
}

const KEY = "bullet-echo:profile:v1";
export const START_COINS = 300;
export const FIRST_RUN_BONUS = 50;

export function dayKey(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function prevDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d - 1));
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic set of three orders for a given calendar day. */
export function questsForDay(day: string): QuestDef[] {
  const rnd = mulberry(hash(`orders-${day}`));
  const pool = [...QUEST_POOL];
  const picked: QuestDef[] = [];
  while (picked.length < 3 && pool.length) {
    const i = Math.floor(rnd() * pool.length);
    picked.push(pool.splice(i, 1)[0]);
  }
  return picked;
}

export function defaultProfile(): Profile {
  return {
    version: 1,
    coins: START_COINS,
    owned: ["classic"],
    equipped: "classic",
    boosters: { heart: 0, rapid: 0 },
    stats: { runs: 0, kills: 0, echo: 0, grazes: 0, bestCombo: 0, bestScore: 0, bestWave: 0, playSec: 0, duelWins: 0 },
    streak: 0,
    lastDay: "",
    bonusDay: "",
    quests: { day: "", items: [] },
  };
}

export function withDaily(p: Profile, today: string): Profile {
  if (p.quests.day === today && p.quests.items.length === 3) return p;
  return {
    ...p,
    quests: {
      day: today,
      items: questsForDay(today).map((q) => ({ id: q.id, progress: 0, claimed: false })),
    },
  };
}

export function loadProfile(): Profile {
  const base = defaultProfile();
  if (typeof window === "undefined") return base;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Profile>) : null;
    const merged: Profile = parsed
      ? {
          ...base,
          ...parsed,
          boosters: { ...base.boosters, ...(parsed.boosters ?? {}) },
          stats: { ...base.stats, ...(parsed.stats ?? {}) },
          quests: parsed.quests ?? base.quests,
        }
      : base;
    const valid = new Set(SKINS.map((s) => s.id));
    merged.owned = merged.owned.filter((id) => valid.has(id));
    if (!merged.owned.includes("classic")) merged.owned.unshift("classic");
    if (!merged.owned.includes(merged.equipped)) merged.equipped = "classic";
    return withDaily(merged, dayKey());
  } catch {
    return withDaily(base, dayKey());
  }
}

export function saveProfile(p: Profile) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // storage unavailable: progress lives for this session only
  }
}

export function buySkin(p: Profile, id: string): Profile {
  const skin = SKINS.find((s) => s.id === id);
  if (!skin || p.owned.includes(id) || p.coins < skin.price) return p;
  return { ...p, coins: p.coins - skin.price, owned: [...p.owned, id] };
}

export function equipSkin(p: Profile, id: string): Profile {
  if (!p.owned.includes(id)) return p;
  return { ...p, equipped: id };
}

export function buyBooster(p: Profile, id: BoosterId): Profile {
  const b = BOOSTERS[id];
  if (p.coins < b.price || p.boosters[id] >= BOOSTER_MAX) return p;
  return { ...p, coins: p.coins - b.price, boosters: { ...p.boosters, [id]: p.boosters[id] + 1 } };
}

export function claimQuest(p: Profile, id: string): Profile {
  const item = p.quests.items.find((q) => q.id === id);
  const def = QUEST_POOL.find((q) => q.id === id);
  if (!item || !def || item.claimed || item.progress < def.target) return p;
  return {
    ...p,
    coins: p.coins + def.reward,
    quests: { ...p.quests, items: p.quests.items.map((q) => (q.id === id ? { ...q, claimed: true } : q)) },
  };
}

/** Spend one of each requested booster that the player owns. */
export function consumeBoosters(p: Profile, want: { heart: boolean; rapid: boolean }) {
  const applied = { heart: want.heart && p.boosters.heart > 0, rapid: want.rapid && p.boosters.rapid > 0 };
  const boosters = {
    heart: p.boosters.heart - (applied.heart ? 1 : 0),
    rapid: p.boosters.rapid - (applied.rapid ? 1 : 0),
  };
  return { profile: { ...p, boosters }, applied };
}

/** Apply a finished run: stats, quest progress, streak and coin rewards. */
export function recordRun(p0: Profile, s: RunSummary, today: string): { profile: Profile; reward: RunReward } {
  let p = withDaily(p0, today);
  const sumKills = s.players.reduce((a, q) => a + q.kills, 0);
  const sumEcho = s.players.reduce((a, q) => a + q.echoKills, 0);
  const sumGrazes = s.players.reduce((a, q) => a + q.grazes, 0);
  const sumScore = s.players.reduce((a, q) => a + q.score, 0);
  const maxCombo = Math.max(0, ...s.players.map((q) => q.bestCombo));
  const maxScore = Math.max(0, ...s.players.map((q) => q.score));
  const duelWin = s.mode === "duel" && s.winner === 0 ? 1 : 0;
  const metrics: Record<Metric, number> = {
    kills: sumKills,
    echo: sumEcho,
    grazes: sumGrazes,
    combo: maxCombo,
    score: maxScore,
    time: Math.floor(s.time),
    wave: s.wave,
    runs: 1,
    duelWin,
  };

  // Quests
  const completed: string[] = [];
  const items = p.quests.items.map((it) => {
    const def = QUEST_POOL.find((q) => q.id === it.id);
    if (!def) return it;
    const v = metrics[def.metric];
    const before = it.progress;
    const next = def.type === "sum" ? Math.min(def.target, before + v) : Math.min(def.target, Math.max(before, v));
    if (before < def.target && next >= def.target) completed.push(def.title);
    return { ...it, progress: next };
  });

  // Streak and first-run bonus
  let streak = p.streak;
  if (p.lastDay !== today) streak = p.lastDay === prevDay(today) ? p.streak + 1 : 1;
  const firstBonus = p.bonusDay !== today ? FIRST_RUN_BONUS : 0;
  const runCoins = Math.floor(sumScore / 40) + s.wave * 8 + duelWin * 60;

  const stats: Stats = {
    runs: p.stats.runs + 1,
    kills: p.stats.kills + sumKills,
    echo: p.stats.echo + sumEcho,
    grazes: p.stats.grazes + sumGrazes,
    bestCombo: Math.max(p.stats.bestCombo, maxCombo),
    bestScore: Math.max(p.stats.bestScore, maxScore),
    bestWave: Math.max(p.stats.bestWave, s.wave),
    playSec: p.stats.playSec + Math.floor(s.time),
    duelWins: p.stats.duelWins + duelWin,
  };

  p = {
    ...p,
    coins: p.coins + runCoins + firstBonus,
    stats,
    streak,
    lastDay: today,
    bonusDay: today,
    quests: { ...p.quests, items },
  };
  return {
    profile: p,
    reward: { score: maxScore, runCoins, firstBonus, completed, streak },
  };
}

export function questProgressLabel(def: QuestDef, progress: number) {
  return `${Math.floor(progress).toLocaleString("en-US")} / ${def.target.toLocaleString("en-US")}`;
}

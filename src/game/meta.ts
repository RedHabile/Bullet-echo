// ── THE HOLLOW · profil, âmes, quêtes du jour, skins & boutique ─────────────
import type { RunStats } from "./types";
import type { SurvivorLook, KillerLook } from "./sprites";

export interface LocalScore {
  id: number; name: string; score: number; fuses: number; timeSec: number;
  diff: string; escaped: boolean; date: string;
}
export interface GlobalScore {
  id: number; name: string; score: number; fuses: number; timeSec: number;
  difficulty: string; escaped: boolean; createdAt: string;
}

// ── catalogue ──
export interface SurvivorSkin { id: string; name: string; desc: string; price: number; look: SurvivorLook; }
export interface KillerSkin { id: string; name: string; desc: string; price: number; look: KillerLook; }
export interface LampDef { id: string; name: string; desc: string; price: number; color: string; }

export const SURVIVOR_SKINS: SurvivorSkin[] = [
  { id: "recrue", name: "La Recrue", desc: "Veste délavée, capuche grise. L'uniforme de ceux qui n'avaient rien prévu.", price: 0, look: { jacket: "#3d4c55", hood: "#232d34", trim: "#4a3b2a", tone: "#cfc4ae" } },
  { id: "infirmiere", name: "L'Infirmière", desc: "Elle connaissait les couloirs. Le tablier n'a pas tout absorbé.", price: 600, look: { jacket: "#9fb8ad", hood: "#6f8f84", trim: "#d9d2c0", tone: "#d8cbb4" } },
  { id: "detenu", name: "Le Détenu 307", desc: "Orange cellulaire. Il s'est évadé une fois. Une seule.", price: 800, look: { jacket: "#b06a2a", hood: "#7a4a1e", trim: "#3a3f45", tone: "#c9b394" } },
  { id: "sangfroid", name: "Sang-Froid", desc: "Bleu nuit. Le cœur ralentit, la main ne tremble pas.", price: 900, look: { jacket: "#2a3f66", hood: "#1b2a47", trim: "#6ab0ff", tone: "#cfc4ae" } },
  { id: "ombre", name: "L'Ombre", desc: "Noir sur noir. Les yeux du boucher glissent sur vous.", price: 1500, look: { jacket: "#14161c", hood: "#0a0c10", trim: "#39d3b8", tone: "#9a917e" } },
  { id: "dore", name: "Le Doré", desc: "Pour ceux qui ont trop survécu. Brillant. Imprudent.", price: 2500, look: { jacket: "#8a6d2a", hood: "#5d4a1e", trim: "#ffd700", tone: "#d8cbb4" } },
];

export const KILLER_SKINS: KillerSkin[] = [
  { id: "boucher", name: "Le Boucher", desc: "Tablier rougi, feuillette émoussée. Il n'a jamais rendu ses clés.", price: 0, look: { body: "#191d23", apron: "#2a1216", stain: "#8c121e", eyes: "#ff2832", blade: "#dfe6ec" } },
  { id: "gardien", name: "Le Gardien", desc: "Bleu uniforme. Il faisait les rondes. Il les fait encore.", price: 700, look: { body: "#1c2433", apron: "#2a3446", stain: "#4a1a1c", eyes: "#6ab0ff", blade: "#c9d2da" } },
  { id: "chirurgien", name: "Le Chirurgien", desc: "Vert opératoire. Il appelle ça des soins.", price: 900, look: { body: "#1d2a26", apron: "#24403a", stain: "#5d1a22", eyes: "#7dffb0", blade: "#eef4f8" } },
  { id: "brule", name: "Le Brûlé", desc: "L'incendie de 1962 ne l'a pas terminé.", price: 1200, look: { body: "#1a1512", apron: "#33201a", stain: "#ff6a3c", eyes: "#ff8c3c", blade: "#b0a89e" } },
  { id: "ecorche", name: "L'Écorché", desc: "Il a retiré ce qui le gênait. Ne regardez pas trop longtemps.", price: 1600, look: { body: "#331416", apron: "#4a1a1c", stain: "#a3122a", eyes: "#ff4a4a", blade: "#d8cfc4" } },
  { id: "fauche", name: "La Fauche", desc: "Os et silence. Les lampes meurent sur son passage.", price: 2200, look: { body: "#23262b", apron: "#3a3f46", stain: "#8a94a0", eyes: "#e8e4d8", blade: "#f2f0e8" } },
];

export const LAMPS: LampDef[] = [
  { id: "ambre", name: "Ambre d'origine", desc: "La lumière du vieil asile.", price: 0, color: "#ffb347" },
  { id: "blanche", name: "Blanche clinique", desc: "Froide. Précise. Sans pitié.", price: 250, color: "#dfe8ff" },
  { id: "verte", name: "Verte maladive", desc: "La teinte des couloirs de la morgue.", price: 350, color: "#7dffb0" },
  { id: "violette", name: "Violette veillée", desc: "Une lumière de fin du monde.", price: 350, color: "#b48cff" },
  { id: "rouge", name: "Rouge alerte", desc: "Pour ne plus jamais se cacher.", price: 450, color: "#ff6a5a" },
];

export const lookSurvivor = (id: string): SurvivorLook =>
  (SURVIVOR_SKINS.find((s) => s.id === id) ?? SURVIVOR_SKINS[0]).look;
export const lookKiller = (id: string): KillerLook =>
  (KILLER_SKINS.find((s) => s.id === id) ?? KILLER_SKINS[0]).look;
export const lampColor = (id: string): string =>
  (LAMPS.find((l) => l.id === id) ?? LAMPS[0]).color;

export function itemInfo(id: string): { name: string; price: number; kind: "survivor" | "killer" | "lamp" } | null {
  const s = SURVIVOR_SKINS.find((x) => x.id === id);
  if (s) return { name: s.name, price: s.price, kind: "survivor" };
  const k = KILLER_SKINS.find((x) => x.id === id);
  if (k) return { name: k.name, price: k.price, kind: "killer" };
  const l = LAMPS.find((x) => x.id === id);
  if (l) return { name: l.name, price: l.price, kind: "lamp" };
  return null;
}

// ── quêtes journalières ──
export type QuestKey = "fuses" | "escapes" | "stuns" | "close" | "hides" | "time" | "onlineWins" | "flares" | "runs";
export interface QuestDef { id: string; key: QuestKey; label: string; target: number; reward: number; }
export interface QuestState { id: string; progress: number; claimed: boolean; }

export const QUEST_POOL: QuestDef[] = [
  { id: "q_fuses", key: "fuses", label: "Récupérer 12 fusibles", target: 12, reward: 250 },
  { id: "q_escape", key: "escapes", label: "S'échapper 2 fois", target: 2, reward: 400 },
  { id: "q_stun", key: "stuns", label: "Parer 3 fois au taser", target: 3, reward: 300 },
  { id: "q_close", key: "close", label: "Frôler la mort 5 fois", target: 5, reward: 250 },
  { id: "q_hide", key: "hides", label: "Se cacher 4 fois dans un casier", target: 4, reward: 200 },
  { id: "q_time", key: "time", label: "Survivre 6 minutes (cumulées)", target: 360, reward: 250 },
  { id: "q_online", key: "onlineWins", label: "Gagner 1 manche en ligne", target: 1, reward: 350 },
  { id: "q_flare", key: "flares", label: "Allumer 3 fusées éclairantes", target: 3, reward: 200 },
  { id: "q_runs", key: "runs", label: "Terminer 3 chasses", target: 3, reward: 200 },
];

export const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function questDefsFor(date: string): QuestDef[] {
  const rng = mulberry(hashStr(date));
  const pool = [...QUEST_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3);
}

export function msToReset(): number {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime();
}
export function fmtReset(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

// ── profil ──
export interface ProfileStats {
  runs: number; escapes: number; caught: number; fuses: number; stuns: number;
  close: number; hides: number; flares: number; time: number; onlineWins: number; best: number;
}
export interface Profile {
  name: string;
  souls: number;
  owned: string[];
  equipped: { survivor: string; killer: string; lamp: string };
  stats: ProfileStats;
  quests: { date: string; list: QuestState[] };
  bonusDate: string;
}

const LS_PROFILE = "hollow.profile.v1";
export const LS_SCORES = "hollow.scores.v1";
export const LS_NAME = "hollow.name";

function defaultProfile(): Profile {
  let name = "SURVIVANT";
  try { name = localStorage.getItem(LS_NAME) || "SURVIVANT"; } catch { /* noop */ }
  return {
    name, souls: 250,
    owned: ["recrue", "boucher", "ambre"],
    equipped: { survivor: "recrue", killer: "boucher", lamp: "ambre" },
    stats: { runs: 0, escapes: 0, caught: 0, fuses: 0, stuns: 0, close: 0, hides: 0, flares: 0, time: 0, onlineWins: 0, best: 0 },
    quests: { date: todayKey(), list: questDefsFor(todayKey()).map((q) => ({ id: q.id, progress: 0, claimed: false })) },
    bonusDate: "",
  };
}

export function saveProfile(p: Profile) {
  try {
    localStorage.setItem(LS_PROFILE, JSON.stringify(p));
    localStorage.setItem(LS_NAME, p.name);
  } catch { /* mode privé */ }
}

export function loadProfile(): { profile: Profile; bonus: number } {
  let p = defaultProfile();
  try {
    const raw = localStorage.getItem(LS_PROFILE);
    if (raw) p = { ...p, ...(JSON.parse(raw) as Profile) };
  } catch { /* noop */ }
  p.owned = Array.from(new Set(["recrue", "boucher", "ambre", ...p.owned]));
  const today = todayKey();
  if (p.quests.date !== today || p.quests.list.length !== 3) {
    p.quests = { date: today, list: questDefsFor(today).map((q) => ({ id: q.id, progress: 0, claimed: false })) };
  }
  let bonus = 0;
  if (p.bonusDate !== today) {
    bonus = 75;
    p.souls += bonus;
    p.bonusDate = today;
  }
  saveProfile(p);
  return { profile: p, bonus };
}

export function applyRun(p: Profile, r: RunStats, score: number): { profile: Profile; earned: number } {
  const earned = Math.max(10, Math.round(score / 10)) + (r.escaped ? 40 : 0) + (r.mode === "online" && r.win ? 60 : 0);
  const next: Profile = { ...p, souls: p.souls + earned, stats: { ...p.stats } };
  const st = next.stats;
  st.runs++; st.fuses += r.fuses; st.stuns += r.stuns; st.close += r.closeCalls;
  st.hides += r.hides; st.flares += r.flares; st.time += r.timeSec;
  if (r.escaped && r.win) st.escapes++;
  else if (!r.win) st.caught++;
  if (r.mode === "online" && r.win) st.onlineWins++;
  st.best = Math.max(st.best, score);
  const gains: Record<QuestKey, number> = {
    fuses: r.fuses, escapes: r.escaped && r.win ? 1 : 0, stuns: r.stuns, close: r.closeCalls,
    hides: r.hides, time: r.timeSec, onlineWins: r.mode === "online" && r.win ? 1 : 0,
    flares: r.flares, runs: 1,
  };
  next.quests = {
    ...p.quests,
    list: p.quests.list.map((qs) => {
      const def = QUEST_POOL.find((d) => d.id === qs.id);
      if (!def || qs.claimed) return qs;
      return { ...qs, progress: Math.min(def.target, qs.progress + gains[def.key]) };
    }),
  };
  saveProfile(next);
  return { profile: next, earned };
}

export function claimQuest(p: Profile, id: string): Profile {
  const def = QUEST_POOL.find((d) => d.id === id);
  const qs = p.quests.list.find((q) => q.id === id);
  if (!def || !qs || qs.claimed || qs.progress < def.target) return p;
  const next: Profile = {
    ...p, souls: p.souls + def.reward,
    quests: { ...p.quests, list: p.quests.list.map((q) => (q.id === id ? { ...q, claimed: true } : q)) },
  };
  saveProfile(next);
  return next;
}

export function buyItem(p: Profile, id: string): Profile {
  const info = itemInfo(id);
  if (!info || p.owned.includes(id) || p.souls < info.price) return p;
  const next: Profile = { ...p, souls: p.souls - info.price, owned: [...p.owned, id] };
  next.equipped = { ...p.equipped, [info.kind]: id };
  saveProfile(next);
  return next;
}

export function equipItem(p: Profile, id: string): Profile {
  const info = itemInfo(id);
  if (!info || !p.owned.includes(id)) return p;
  const next: Profile = { ...p, equipped: { ...p.equipped, [info.kind]: id } };
  saveProfile(next);
  return next;
}

export const readScores = (): LocalScore[] => {
  try { return JSON.parse(localStorage.getItem(LS_SCORES) ?? "[]") as LocalScore[]; } catch { return []; }
};

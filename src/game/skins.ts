// Ship skins and run boosters catalog (pure data).

export type ShipShape = "arrow" | "delta" | "wing" | "orb" | "needle" | "hex";
export type Rarity = "Common" | "Rare" | "Epic" | "Legendary";

export interface Skin {
  id: string;
  name: string;
  price: number;
  rarity: Rarity;
  color: string;
  shape: ShipShape;
  note: string;
  hidden?: boolean;
}

export const RARITY_COLOR: Record<Rarity, string> = {
  Common: "#8a8f99",
  Rare: "#5ef2ff",
  Epic: "#a78bfa",
  Legendary: "#ffd166",
};

export const SKINS: Skin[] = [
  { id: "classic", name: "Classic Cyan", price: 0, rarity: "Common", color: "#5ef2ff", shape: "arrow", note: "Factory issue. Light, quick, honest." },
  { id: "viper", name: "Viper", price: 250, rarity: "Common", color: "#9dff5a", shape: "delta", note: "Swept-back wings. Turns on a coin." },
  { id: "ember", name: "Ember Runner", price: 520, rarity: "Rare", color: "#ffb020", shape: "wing", note: "Runs hot. Every echo leaves a trail." },
  { id: "rose", name: "Neon Rose", price: 780, rarity: "Rare", color: "#ff3ea5", shape: "orb", note: "A round hull that never clips a corner." },
  { id: "ghost", name: "Ghost Hex", price: 1100, rarity: "Epic", color: "#a78bfa", shape: "hex", note: "Hard to read, harder to hit." },
  { id: "needle", name: "Chrome Needle", price: 1450, rarity: "Epic", color: "#f8fbff", shape: "needle", note: "Razor profile for razor-thin runs." },
  { id: "solar", name: "Solar Wing", price: 2200, rarity: "Legendary", color: "#ffd166", shape: "wing", note: "Sun-gold plating. Bounces glow brighter." },
  { id: "abyss", name: "Abyss Hex", price: 3000, rarity: "Legendary", color: "#2dd4bf", shape: "hex", note: "Forged under pressure in the deep grid." },
];

// Player two's fixed hull in duel mode (not sold).
export const DUELIST: Skin = {
  id: "duelist",
  name: "Duelist Violet",
  price: 0,
  rarity: "Common",
  color: "#a78bfa",
  shape: "delta",
  note: "Player two's hull.",
  hidden: true,
};

export type BoosterId = "heart" | "rapid";

export const BOOSTERS: Record<BoosterId, { id: BoosterId; name: string; price: number; note: string }> = {
  heart: { id: "heart", name: "Reserve Heart", price: 180, note: "Start the run with one extra life." },
  rapid: { id: "rapid", name: "Rapid Start", price: 220, note: "Begin with rapid fire for 10 seconds." },
};

export const BOOSTER_MAX = 5;

export function getSkin(id: string): Skin {
  return SKINS.find((s) => s.id === id) ?? SKINS[0];
}

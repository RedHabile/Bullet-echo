"use client";

import { useEffect, useState, type ReactNode } from "react";
import ShipPreview from "./ShipPreview";
import { BOOSTERS, BOOSTER_MAX, RARITY_COLOR, SKINS, getSkin, type BoosterId, type Skin } from "@/game/skins";
import { QUEST_POOL, questProgressLabel, type Profile, type QuestDef } from "@/game/profile";
import type { ScoreEntry } from "@/game/highscores";
import type { Mode } from "@/game/types";

const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const C = { bg: "#0b0c0f", panel: "#121318", line: "#262832", bone: "#ece8df", muted: "#8b8f9a", gold: "#ffd166" };

type Tab = "launch" | "hangar" | "armory" | "orders" | "records";
const TABS: { id: Tab; label: string }[] = [
  { id: "launch", label: "Launch" },
  { id: "hangar", label: "Hangar" },
  { id: "armory", label: "Armory" },
  { id: "orders", label: "Orders" },
  { id: "records", label: "Records" },
];

export interface MenuProps {
  profile: Profile;
  scores: ScoreEntry[];
  muted: boolean;
  loadout: { heart: boolean; rapid: boolean };
  onLoadout: (next: { heart: boolean; rapid: boolean }) => void;
  onLaunch: (mode: Mode, loadout: { heart: boolean; rapid: boolean }) => void;
  onEquip: (id: string) => void;
  onBuySkin: (id: string) => void;
  onBuyBooster: (id: BoosterId) => void;
  onClaim: (id: string) => void;
  onClearScores: () => void;
  onToggleMute: () => void;
}

const fmt = (n: number) => n.toLocaleString("en-US");

function Coin({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className="inline-block align-[-2px]">
      <circle cx="8" cy="8" r="7" fill={C.gold} />
      <circle cx="8" cy="8" r="4.6" fill="none" stroke="#8a6a1f" strokeWidth="1.2" />
      <path d="M6.2 6.2h2.2a1.1 1.1 0 0 1 0 2.2H6.2m0 0h2.6" fill="none" stroke="#8a6a1f" strokeWidth="1.2" />
    </svg>
  );
}

function Btn({
  children,
  onClick,
  primary,
  disabled,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  primary?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-10 border px-4 text-[11px] uppercase tracking-[0.18em] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        primary
          ? "border-[#ffd166] bg-[#ffd166] text-[#0b0c0f] hover:bg-[#ffe08f]"
          : "border-[#262832] bg-transparent text-[#ece8df] hover:border-[#ece8df]/60"
      } ${className}`}
      style={{ fontFamily: MONO }}
    >
      {children}
    </button>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10px] uppercase tracking-[0.28em]" style={{ fontFamily: MONO, color: C.muted }}>
      {children}
    </p>
  );
}

function Title({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-[#262832] pb-5">
      <div>
        {sub}
        <h2 className="mt-2 text-[44px] leading-none sm:text-[56px]" style={{ fontFamily: SERIF, color: C.bone }}>
          {children}
        </h2>
      </div>
    </div>
  );
}

function Corner({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const base = "absolute h-4 w-4 border-[#ffd166]/70";
  const map = {
    tl: "left-0 top-0 border-l border-t",
    tr: "right-0 top-0 border-r border-t",
    bl: "bottom-0 left-0 border-b border-l",
    br: "bottom-0 right-0 border-b border-r",
  };
  return <span className={`${base} ${map[pos]}`} />;
}

export default function MainMenu(props: MenuProps) {
  const { profile: p, scores } = props;
  const [tab, setTab] = useState<Tab>("launch");
  const [note, setNote] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!note) return;
    const id = setTimeout(() => setNote(null), 2200);
    return () => clearTimeout(id);
  }, [note]);

  const skin = getSkin(p.equipped);
  const orders = p.quests.items
    .map((state) => ({ state, def: QUEST_POOL.find((d) => d.id === state.id) }))
    .filter((o): o is { state: Profile["quests"]["items"][number]; def: QuestDef } => Boolean(o.def));
  const claimable = orders.filter((o) => !o.state.claimed && o.state.progress >= o.def.target).length;
  // Only boosters the player actually owns can be armed.
  const loadout = {
    heart: props.loadout.heart && p.boosters.heart > 0,
    rapid: props.loadout.rapid && p.boosters.rapid > 0,
  };

  const tomorrowMs = (() => {
    if (!now) return null;
    const d = new Date(now);
    d.setHours(24, 0, 0, 0);
    return d.getTime() - now;
  })();

  const flash = (msg: string) => setNote(msg);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#0b0c0f]/92 text-[#ece8df] md:flex-row" style={{ fontFamily: MONO }}>
      {/* ---------- rail ---------- */}
      <aside className="flex shrink-0 flex-col gap-6 border-b border-[#262832] p-4 md:w-[260px] md:border-b-0 md:border-r md:p-6">
        <div className="flex items-center justify-between md:block">
          <div>
            <p className="text-[10px] tracking-[0.3em] text-[#8b8f9a]">ARCADE / FLIGHT DECK</p>
            <h1 className="mt-2 text-[34px] italic leading-[0.9] md:text-[46px]" style={{ fontFamily: SERIF }}>
              Bullet
              <br />
              Echo
            </h1>
          </div>
          <div className="hidden text-right md:mt-6 md:block">
            <p className="text-[10px] tracking-[0.2em] text-[#8b8f9a]">BALANCE</p>
            <p className="mt-1 flex items-center justify-end gap-2 text-2xl tabular-nums">
              <Coin size={18} />
              {fmt(p.coins)}
            </p>
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto md:flex-col md:gap-0">
          {TABS.map((t, i) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`group flex shrink-0 items-center gap-3 border-l-2 px-3 py-2.5 text-left transition-colors md:py-3 ${
                  active ? "border-[#ffd166] text-[#ece8df]" : "border-transparent text-[#8b8f9a] hover:text-[#ece8df]"
                }`}
              >
                <span className="text-[10px] tabular-nums text-[#8b8f9a]">0{i + 1}</span>
                <span className="text-[15px]" style={{ fontFamily: SERIF }}>
                  {t.label}
                </span>
                {t.id === "orders" && claimable > 0 && (
                  <span className="ml-auto rounded-full bg-[#ffd166] px-1.5 text-[10px] font-bold text-[#0b0c0f]">
                    {claimable}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto hidden flex-col gap-3 border-t border-[#262832] pt-4 text-[11px] text-[#8b8f9a] md:flex">
          <div className="flex items-center justify-between">
            <span>STREAK</span>
            <span className="text-[#ece8df]">{p.streak} {p.streak === 1 ? "DAY" : "DAYS"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>SOUND</span>
            <button type="button" onClick={props.onToggleMute} className="text-[#ece8df] underline-offset-4 hover:underline">
              {props.muted ? "OFF" : "ON"} · M
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span>START</span>
            <span className="text-[#ece8df]">ENTER solo · D duel</span>
          </div>
        </div>
      </aside>

      {/* ---------- main ---------- */}
      <main className="relative min-h-0 flex-1 overflow-y-auto p-5 sm:p-8 md:p-10">
        {tab === "launch" && (
          <section className="rise">
            <Title
              sub={
                <Eyebrow>
                  BAY 01 · {skin.name.toUpperCase()} · {p.boosters.heart + p.boosters.rapid} BOOSTERS
                </Eyebrow>
              }
            >
              Launch
            </Title>
            <div className="grid gap-10 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
              <div className="flex flex-col gap-6">
                <div className="relative mx-auto flex aspect-square w-full max-w-[340px] items-center justify-center border border-[#262832] bg-[#121318]">
                  <Corner pos="tl" />
                  <Corner pos="tr" />
                  <Corner pos="bl" />
                  <Corner pos="br" />
                  <ShipPreview skin={skin} size={280} />
                </div>
                <div>
                  <p className="text-[10px] tracking-[0.2em]" style={{ color: RARITY_COLOR[skin.rarity] }}>
                    {skin.rarity.toUpperCase()}
                  </p>
                  <p className="mt-1 text-3xl" style={{ fontFamily: SERIF }}>
                    {skin.name}
                  </p>
                  <p className="mt-2 text-sm italic" style={{ fontFamily: SERIF, color: C.muted }}>
                    {skin.note}
                  </p>
                </div>

                <div className="border-t border-[#262832] pt-5">
                  <Eyebrow>Loadout for next run</Eyebrow>
                  <div className="mt-3 grid gap-2">
                    <BoosterRow
                      id="heart"
                      owned={p.boosters.heart}
                      armed={loadout.heart}
                      onToggle={() => props.onLoadout({ ...props.loadout, heart: !props.loadout.heart })}
                    />
                    <BoosterRow
                      id="rapid"
                      owned={p.boosters.rapid}
                      armed={loadout.rapid}
                      onToggle={() => props.onLoadout({ ...props.loadout, rapid: !props.loadout.rapid })}
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col">
                <ModeRow
                  index="01"
                  title="Solo"
                  body="Hold the arena alone. Shots echo off the walls for 1.5× points. Chain kills to climb the multiplier before the swarm catches you."
                  chips={["1 PILOT", "3 LIVES", "ENDLESS WAVES"]}
                  keyHint="ENTER"
                  onClick={() => props.onLaunch("solo", loadout)}
                />
                <ModeRow
                  index="02"
                  title="Duel"
                  body="Two pilots, one screen. Left half of a touchscreen is P1, right half is P2. Your bullets hurt the other pilot for +300."
                  chips={["2 PILOTS", "SHARED SCREEN", "WINNER TAKES THE BOARD"]}
                  keyHint="D"
                  onClick={() => props.onLaunch("duel", loadout)}
                />

                <div className="mt-8">
                  <div className="mb-3 flex items-center justify-between">
                    <Eyebrow>Today&apos;s orders</Eyebrow>
                    <button type="button" onClick={() => setTab("orders")} className="text-[11px] text-[#ffd166] underline-offset-4 hover:underline">
                      VIEW ALL →
                    </button>
                  </div>
                  <ul className="grid gap-3">
                    {orders.map((o) => (
                      <li key={o.state.id} className="grid grid-cols-[1fr_auto] items-center gap-4 text-xs">
                        <div>
                          <p style={{ fontFamily: SERIF }} className="text-base">
                            {o.def.title}
                          </p>
                          <div className="mt-1.5 h-[3px] w-full bg-[#262832]">
                            <div
                              className="h-full bg-[#ffd166] transition-[width] duration-500"
                              style={{ width: `${Math.min(100, (o.state.progress / o.def.target) * 100)}%` }}
                            />
                          </div>
                        </div>
                        <span className="tabular-nums text-[#8b8f9a]">{questProgressLabel(o.def, o.state.progress)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-6 text-[11px] text-[#8b8f9a]">
                    BEST {fmt(p.stats.bestScore)} · RUNS {p.stats.runs} · STREAK {p.streak}
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {tab === "hangar" && (
          <section className="rise">
            <Title sub={<Eyebrow>HANGAR · {p.owned.length} OF {SKINS.length} HULLS OWNED</Eyebrow>}>Hangar</Title>
            <div className="grid gap-px bg-[#262832] sm:grid-cols-2 xl:grid-cols-3">
              {SKINS.map((s) => {
                const owned = p.owned.includes(s.id);
                const equipped = p.equipped === s.id;
                return (
                  <SkinCard key={s.id} skin={s}>
                    {equipped ? (
                      <Btn disabled className="w-full">
                        Equipped
                      </Btn>
                    ) : owned ? (
                      <Btn
                        primary
                        className="w-full"
                        onClick={() => {
                          props.onEquip(s.id);
                          flash(`${s.name} equipped`);
                        }}
                      >
                        Equip
                      </Btn>
                    ) : (
                      <Btn disabled className="w-full">
                        Locked · buy in Armory
                      </Btn>
                    )}
                  </SkinCard>
                );
              })}
            </div>
          </section>
        )}

        {tab === "armory" && (
          <section className="rise">
            <Title
              sub={
                <Eyebrow>
                  ARMORY · BALANCE <Coin /> {fmt(p.coins)}
                </Eyebrow>
              }
            >
              Armory
            </Title>

            <Eyebrow>Hulls</Eyebrow>
            <div className="mb-10 mt-3 grid gap-px bg-[#262832] sm:grid-cols-2 xl:grid-cols-3">
              {SKINS.map((s) => {
                const owned = p.owned.includes(s.id);
                const afford = p.coins >= s.price;
                return (
                  <SkinCard key={s.id} skin={s}>
                    {owned ? (
                      <Btn disabled className="w-full">
                        Owned
                      </Btn>
                    ) : (
                      <Btn
                        primary={afford}
                        disabled={!afford}
                        className="flex w-full items-center justify-center gap-2"
                        onClick={() => {
                          props.onBuySkin(s.id);
                          flash(`${s.name} acquired`);
                        }}
                      >
                        Buy · <Coin /> {fmt(s.price)}
                      </Btn>
                    )}
                  </SkinCard>
                );
              })}
            </div>

            <Eyebrow>Run boosters · max {BOOSTER_MAX} each</Eyebrow>
            <div className="mt-3 grid gap-px bg-[#262832] md:grid-cols-2">
              {(Object.keys(BOOSTERS) as BoosterId[]).map((id) => {
                const b = BOOSTERS[id];
                const owned = p.boosters[id];
                const afford = p.coins >= b.price && owned < BOOSTER_MAX;
                return (
                  <div key={id} className="flex flex-col justify-between gap-6 bg-[#0b0c0f] p-6">
                    <div>
                      <p className="text-2xl" style={{ fontFamily: SERIF }}>
                        {b.name}
                      </p>
                      <p className="mt-2 text-sm italic" style={{ fontFamily: SERIF, color: C.muted }}>
                        {b.note}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[11px] tracking-[0.2em] text-[#8b8f9a]">OWNED ×{owned}</span>
                      <Btn
                        primary={afford}
                        disabled={!afford}
                        className="flex items-center gap-2"
                        onClick={() => {
                          props.onBuyBooster(id);
                          flash(`${b.name} stocked`);
                        }}
                      >
                        {owned >= BOOSTER_MAX ? "Full" : <>Buy · <Coin /> {fmt(b.price)}</>}
                      </Btn>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {tab === "orders" && (
          <section className="rise">
            <Title
              sub={
                <Eyebrow>
                  DAILY ORDERS · NEW SET IN {tomorrowMs === null ? "--:--:--" : formatCountdown(tomorrowMs)}
                </Eyebrow>
              }
            >
              Orders
            </Title>

            <div className="grid gap-px bg-[#262832]">
              {orders.map((o, i) => {
                const done = o.state.progress >= o.def.target;
                const pct = Math.min(100, (o.state.progress / o.def.target) * 100);
                return (
                  <div key={o.state.id} className="grid gap-5 bg-[#0b0c0f] p-6 md:grid-cols-[48px_1fr_auto] md:items-center">
                    <span className="text-3xl italic text-[#8b8f9a]" style={{ fontFamily: SERIF }}>
                      {String.fromCharCode(65 + i)}
                    </span>
                    <div>
                      <p className="text-2xl" style={{ fontFamily: SERIF }}>
                        {o.def.title}
                      </p>
                      <p className="mt-1 text-xs text-[#8b8f9a]">{o.def.detail}</p>
                      <div className="mt-4 flex items-center gap-4">
                        <div className="h-[3px] flex-1 bg-[#262832]">
                          <div className="h-full bg-[#ffd166] transition-[width] duration-500" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-24 text-right text-xs tabular-nums text-[#8b8f9a]">
                          {questProgressLabel(o.def, o.state.progress)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-4 md:flex-col md:items-end">
                      <span className="flex items-center gap-2 text-sm tabular-nums">
                        <Coin /> {fmt(o.def.reward)}
                      </span>
                      {o.state.claimed ? (
                        <Btn disabled>Claimed</Btn>
                      ) : (
                        <Btn
                          primary={done}
                          disabled={!done}
                          onClick={() => {
                            props.onClaim(o.state.id);
                            flash(`+${o.def.reward} coins`);
                          }}
                        >
                          {done ? "Claim" : "In progress"}
                        </Btn>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-6 border-t border-[#262832] pt-6 text-xs text-[#8b8f9a]">
              <div>
                <p className="text-[10px] tracking-[0.2em]">STREAK</p>
                <div className="mt-2 flex gap-1.5">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <span key={i} className={`h-2.5 w-5 ${i < Math.min(7, p.streak) ? "bg-[#ffd166]" : "bg-[#262832]"}`} />
                  ))}
                </div>
                <p className="mt-2 text-[#ece8df]">{p.streak} {p.streak === 1 ? "day" : "days"} in a row</p>
              </div>
              <p className="max-w-sm leading-relaxed">
                Your first run every day pays <Coin /> 50 bonus. Consecutive days build a streak. Orders are the same for
                everyone on the same calendar day.
              </p>
            </div>
          </section>
        )}

        {tab === "records" && (
          <section className="rise">
            <Title sub={<Eyebrow>RECORDS · LOCAL PROFILE</Eyebrow>}>Records</Title>
            <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
              <dl className="grid grid-cols-2 gap-px bg-[#262832]">
                <Stat k="Runs" v={fmt(p.stats.runs)} />
                <Stat k="Best score" v={fmt(p.stats.bestScore)} />
                <Stat k="Best combo" v={`×${p.stats.bestCombo}`} />
                <Stat k="Best wave" v={String(p.stats.bestWave)} />
                <Stat k="Kills" v={fmt(p.stats.kills)} />
                <Stat k="Echo kills" v={fmt(p.stats.echo)} />
                <Stat k="Grazes" v={fmt(p.stats.grazes)} />
                <Stat k="Duel wins" v={String(p.stats.duelWins)} />
                <Stat k="Time flown" v={formatHours(p.stats.playSec)} />
                <Stat k="Hulls" v={`${p.owned.length}/${SKINS.length}`} />
              </dl>

              <div className="flex min-w-0 flex-col gap-3">
                <div className="flex items-center justify-between">
                  <Eyebrow>High scores · top 10</Eyebrow>
                  {scores.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm("Clear the local high-score table?")) props.onClearScores();
                      }}
                      className="text-[11px] text-[#8b8f9a] underline-offset-4 hover:text-[#ff5470] hover:underline"
                    >
                      CLEAR
                    </button>
                  )}
                </div>
                <div className="border border-[#262832]">
                  <table className="w-full text-left text-sm tabular-nums">
                    <thead className="text-[10px] tracking-[0.2em] text-[#8b8f9a]">
                      <tr className="border-b border-[#262832]">
                        <th className="px-4 py-3 font-normal">No</th>
                        <th className="px-4 py-3 font-normal">Pilot</th>
                        <th className="px-4 py-3 text-right font-normal">Score</th>
                        <th className="px-4 py-3 text-right font-normal">Mode</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scores.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-4 py-10 text-center text-[#8b8f9a]">
                            No runs logged yet.
                          </td>
                        </tr>
                      )}
                      {scores.map((s, i) => (
                        <tr key={`${s.date}-${i}`} className="border-b border-[#262832]/60 last:border-0">
                          <td className="px-4 py-2.5 text-[#8b8f9a]">{String(i + 1).padStart(2, "0")}</td>
                          <td className="truncate px-4 py-2.5">{s.name}</td>
                          <td className="px-4 py-2.5 text-right">{fmt(s.score)}</td>
                          <td className="px-4 py-2.5 text-right text-[11px] text-[#8b8f9a]">
                            {s.mode === "duel" ? "DUEL" : `WAVE ${s.wave}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {note && (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 -translate-x-1/2 border border-[#ffd166]/50 bg-[#0b0c0f] px-5 py-2.5 text-[11px] uppercase tracking-[0.2em] text-[#ffd166]">
          {note}
        </div>
      )}
    </div>
  );
}

function SkinCard({ skin, children }: { skin: Skin; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 bg-[#0b0c0f] p-5">
      <div className="flex h-[190px] items-center justify-center bg-[#121318]">
        <ShipPreview skin={skin} size={150} spin={false} />
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xl" style={{ fontFamily: SERIF }}>
          {skin.name}
        </p>
        <span className="text-[10px] tracking-[0.2em]" style={{ fontFamily: MONO, color: RARITY_COLOR[skin.rarity] }}>
          {skin.rarity.toUpperCase()}
        </span>
      </div>
      <p className="-mt-2 text-xs italic" style={{ fontFamily: SERIF, color: C.muted }}>
        {skin.note}
      </p>
      <div className="mt-auto">{children}</div>
    </div>
  );
}

function BoosterRow({
  id,
  owned,
  armed,
  onToggle,
}: {
  id: BoosterId;
  owned: number;
  armed: boolean;
  onToggle: () => void;
}) {
  const b = BOOSTERS[id];
  const none = owned === 0;
  return (
    <div className="flex items-center justify-between gap-4 border border-[#262832] px-4 py-3">
      <div className="min-w-0">
        <p className="text-base" style={{ fontFamily: SERIF }}>
          {b.name} <span className="text-xs text-[#8b8f9a]">×{owned}</span>
        </p>
        <p className="truncate text-[11px] text-[#8b8f9a]">{none ? "None owned · buy in Armory" : b.note}</p>
      </div>
      <button
        type="button"
        disabled={none}
        onClick={onToggle}
        aria-pressed={armed}
        className={`shrink-0 border px-3 py-1.5 text-[10px] tracking-[0.2em] transition-colors disabled:opacity-30 ${
          armed ? "border-[#ffd166] bg-[#ffd166] text-[#0b0c0f]" : "border-[#262832] text-[#8b8f9a] hover:text-[#ece8df]"
        }`}
      >
        {armed ? "ARMED" : "STANDBY"}
      </button>
    </div>
  );
}

function ModeRow({
  index,
  title,
  body,
  chips,
  keyHint,
  onClick,
}: {
  index: string;
  title: string;
  body: string;
  chips: string[];
  keyHint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group grid grid-cols-[48px_1fr] gap-x-4 border-t border-[#262832] py-6 text-left transition-colors first:border-t-0 hover:bg-white/[0.02] sm:grid-cols-[56px_1fr_auto]"
    >
      <span className="pt-2 text-[11px] text-[#8b8f9a]">{index}</span>
      <span>
        <span className="flex items-baseline gap-3">
          <span className="text-[40px] leading-none transition-transform group-hover:translate-x-1" style={{ fontFamily: SERIF }}>
            {title}
          </span>
        </span>
        <span className="mt-3 block max-w-md text-sm leading-relaxed text-[#8b8f9a]">{body}</span>
        <span className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] tracking-[0.18em] text-[#8b8f9a]/80">
          {chips.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </span>
      </span>
      <span className="col-span-2 mt-3 flex items-center gap-2 text-[11px] tracking-[0.2em] text-[#ffd166] sm:col-span-1 sm:mt-2 sm:self-start">
        <span className="hidden sm:inline text-[#8b8f9a]">[{keyHint}]</span>
        <span className="transition-transform group-hover:translate-x-1">LAUNCH →</span>
      </span>
    </button>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="bg-[#0b0c0f] p-5">
      <dt className="text-[10px] tracking-[0.2em] text-[#8b8f9a]">{k.toUpperCase()}</dt>
      <dd className="mt-2 text-2xl tabular-nums" style={{ fontFamily: SERIF }}>
        {v}
      </dd>
    </div>
  );
}

function formatCountdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
}

function formatHours(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

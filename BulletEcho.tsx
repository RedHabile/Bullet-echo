"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Engine } from "@/game/engine";
import { InputController } from "@/game/input";
import { renderGame } from "@/game/render";
import { sfx } from "@/game/audio";
import { clearScores, loadScores, qualifies, saveScore, type ScoreEntry } from "@/game/highscores";
import {
  buyBooster,
  buySkin,
  claimQuest,
  consumeBoosters,
  dayKey,
  defaultProfile,
  equipSkin,
  loadProfile,
  QUEST_POOL,
  recordRun,
  saveProfile,
  type Profile,
  type RunReward,
} from "@/game/profile";
import { getSkin, type BoosterId } from "@/game/skins";
import { H, W, type HudSnapshot, type Mode, type Phase, type RunSummary } from "@/game/types";
import MainMenu from "./MainMenu";

const SIM_STEP = 1 / 120;
const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

type Loadout = { heart: boolean; rapid: boolean };
const NO_LOADOUT: Loadout = { heart: false, rapid: false };

function blurActive() {
  const el = document.activeElement as HTMLElement | null;
  el?.blur?.();
}

const fmt = (n: number) => n.toLocaleString("en-US");

export default function BulletEcho() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const inputRef = useRef<InputController | null>(null);
  const savedRef = useRef(false);
  const summaryRef = useRef<RunSummary | null>(null);
  const nameRef = useRef("PILOT");
  const mutedRef = useRef(false);
  const profileRef = useRef<Profile>(defaultProfile());
  const lastLoadoutRef = useRef<Loadout>(NO_LOADOUT);

  const [phase, setPhase] = useState<Phase>("menu");
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [newRecord, setNewRecord] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedDate, setSavedDate] = useState<number | undefined>(undefined);
  const [name, setName] = useState("PILOT");
  const [muted, setMuted] = useState(false);
  const [profile, setProfile] = useState<Profile>(defaultProfile());
  const [reward, setReward] = useState<RunReward | null>(null);
  const [loadout, setLoadout] = useState<Loadout>(NO_LOADOUT);

  const writeProfile = (next: Profile) => {
    profileRef.current = next;
    saveProfile(next);
    setProfile(next);
  };
  const mutateProfile = (fn: (p: Profile) => Profile) => writeProfile(fn(profileRef.current));

  // ---------- engine lifecycle ----------
  useEffect(() => {
    const canvas = canvasRef.current!;
    const stage = stageRef.current!;
    const ctx = canvas.getContext("2d", { alpha: false })!;
    const engine = new Engine();
    const input = new InputController();
    engineRef.current = engine;
    inputRef.current = input;
    input.attach(canvas);

    const initial = loadScores();
    setScores(initial);
    engine.bestLocal = initial[0]?.score ?? 0;
    const initialProfile = loadProfile();
    writeProfile(initialProfile);

    engine.onPhase = (ph, sum) => {
      setPhase(ph);
      input.captureKeys = ph === "countdown" || ph === "playing";
      if (ph === "over" && sum) {
        summaryRef.current = sum;
        setSummary(sum);
        setNewRecord(qualifies(sum.score, loadScores()));
        setSaved(false);
        setSavedDate(undefined);
        const res = recordRun(profileRef.current, sum, dayKey());
        writeProfile(res.profile);
        setReward(res.reward);
      }
    };

    const resize = () => {
      const r = stage.getBoundingClientRect();
      const availW = Math.max(10, r.width - 16);
      const availH = Math.max(10, r.height - 8);
      const scale = Math.max(0.1, Math.min(availW / W, availH / H));
      const cw = Math.floor(W * scale);
      const ch = Math.floor(H * scale);
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
      canvas.width = Math.max(2, Math.round(cw * dpr));
      canvas.height = Math.max(2, Math.round(ch * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(stage);

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let hudTimer = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      acc += dt;
      const frameInput = input.getFrame(now);
      let steps = 0;
      while (acc >= SIM_STEP && steps < 12) {
        engine.update(SIM_STEP, frameInput);
        acc -= SIM_STEP;
        steps++;
      }
      if (steps >= 12) acc = 0;
      renderGame(ctx, engine, frameInput);

      hudTimer += dt;
      if (hudTimer > 0.1) {
        hudTimer = 0;
        setHud(engine.getHud());
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onVisibility = () => {
      if (document.hidden && (engine.phase === "playing" || engine.phase === "countdown")) engine.togglePause();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      input.detach();
      document.removeEventListener("visibilitychange", onVisibility);
      engineRef.current = null;
      inputRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- actions ----------
  const startRun = (mode: Mode, want: Loadout) => {
    sfx.init();
    sfx.setMuted(mutedRef.current);
    const engine = engineRef.current;
    const input = inputRef.current;
    if (!engine || !input) return;
    blurActive();

    const consumed = consumeBoosters(profileRef.current, want);
    writeProfile(consumed.profile);
    lastLoadoutRef.current = want;

    input.mode = mode;
    input.clearPressed();
    savedRef.current = false;
    summaryRef.current = null;
    setSaved(false);
    setReward(null);
    engine.start({
      mode,
      skin: getSkin(profileRef.current.equipped),
      heart: consumed.applied.heart,
      rapid: consumed.applied.rapid,
    });
  };

  const commitRun = () => {
    const sum = summaryRef.current;
    const engine = engineRef.current;
    if (!sum || savedRef.current || !engine) return;
    savedRef.current = true;
    if (!qualifies(sum.score, loadScores())) return;
    const entryName = nameRef.current.trim().slice(0, 12).toUpperCase() || "PILOT";
    const date = Date.now();
    const updated = saveScore({ name: entryName, score: sum.score, mode: sum.mode, wave: sum.wave, date });
    setSavedDate(date);
    setScores(updated);
    engine.bestLocal = updated[0]?.score ?? 0;
    setSaved(true);
  };

  const playAgain = () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.phase === "over" && !engine.overReady) return;
    commitRun();
    startRun(engine.mode, lastLoadoutRef.current);
  };

  const restart = () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.phase === "over") {
      playAgain();
      return;
    }
    if (engine.phase === "playing" || engine.phase === "countdown" || engine.phase === "paused") {
      startRun(engine.mode, lastLoadoutRef.current);
    }
  };

  const toMenu = () => {
    const engine = engineRef.current;
    const input = inputRef.current;
    if (!engine || !input) return;
    blurActive();
    commitRun();
    input.clearPressed();
    engine.toMenu();
    setScores(loadScores());
    setReward(null);
  };

  const togglePause = () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.phase === "playing" || engine.phase === "countdown" || engine.phase === "paused") {
      blurActive();
      engine.togglePause();
    }
  };

  const toggleMute = () => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    sfx.init();
    sfx.setMuted(next);
    setMuted(next);
  };

  const clearBoard = () => {
    clearScores();
    setScores([]);
    if (engineRef.current) engineRef.current.bestLocal = 0;
  };

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const engine = engineRef.current;
      if (!engine) return;
      const ph = engine.phase;

      if (e.code === "KeyM") {
        toggleMute();
        return;
      }
      if (ph === "menu") {
        if (e.code === "Enter" || e.code === "Space") {
          e.preventDefault();
          startRun("solo", loadout);
        } else if (e.code === "KeyD") {
          startRun("duel", loadout);
        }
        return;
      }
      if (e.code === "KeyP" || e.code === "Escape") {
        e.preventDefault();
        if (ph === "over") toMenu();
        else togglePause();
        return;
      }
      if (ph === "over") {
        if (e.code === "Enter" || e.code === "Space") {
          e.preventDefault();
          playAgain();
        } else if (e.code === "KeyR") {
          playAgain();
        }
        return;
      }
      if (e.code === "KeyR") restart();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---------- derived ----------
  const inRun = phase === "playing" || phase === "countdown" || phase === "paused";
  const overReady = hud?.overReady ?? false;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    playAgain();
  };

  return (
    <div className="scanlines relative flex h-dvh w-full flex-col overflow-hidden bg-[#0b0c0f] text-[#ece8df]">
      <header className="relative z-10 flex h-11 shrink-0 items-center justify-between gap-3 px-3 sm:px-5" style={{ fontFamily: MONO }}>
        <div className="flex items-center gap-3">
          <span className="text-[11px] tracking-[0.25em] text-[#ece8df]/80">BULLET ECHO</span>
          {inRun && hud && (
            <span className="hidden text-[10px] tracking-[0.2em] text-[#8b8f9a] sm:inline">
              {hud.mode === "duel" ? "DUEL" : "SOLO"} · {getSkin(profile.equipped).name.toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!inRun && (
            <span className="hidden items-center gap-2 text-[11px] tabular-nums text-[#8b8f9a] sm:flex">
              COINS <span className="text-[#ece8df]">{fmt(profile.coins)}</span>
            </span>
          )}
          <button
            type="button"
            onClick={toggleMute}
            className="h-8 border border-[#262832] px-3 text-[10px] tracking-[0.2em] text-[#8b8f9a] hover:text-[#ece8df]"
            aria-label={muted ? "Unmute sound" : "Mute sound"}
          >
            SOUND {muted ? "OFF" : "ON"}
          </button>
          {inRun && (
            <button
              type="button"
              onClick={togglePause}
              className="h-8 border border-[#ffd166] bg-[#ffd166] px-3 text-[10px] tracking-[0.2em] text-[#0b0c0f] hover:bg-[#ffe08f]"
            >
              {phase === "paused" ? "RESUME" : "PAUSE"} · P
            </button>
          )}
        </div>
      </header>

      <div ref={stageRef} className="relative z-0 flex min-h-0 flex-1 items-center justify-center px-2 pb-2">
        <canvas
          ref={canvasRef}
          className="touch-none select-none"
          aria-label="Bullet Echo game canvas"
        />
      </div>

      {phase === "menu" && (
        <MainMenu
          profile={profile}
          scores={scores}
          muted={muted}
          loadout={loadout}
          onLoadout={setLoadout}
          onLaunch={(mode, lo) => startRun(mode, lo)}
          onEquip={(id) => mutateProfile((p) => equipSkin(p, id))}
          onBuySkin={(id) => mutateProfile((p) => buySkin(p, id))}
          onBuyBooster={(id: BoosterId) => mutateProfile((p) => buyBooster(p, id))}
          onClaim={(id) => mutateProfile((p) => claimQuest(p, id))}
          onClearScores={clearBoard}
          onToggleMute={toggleMute}
        />
      )}

      {phase === "paused" && (
        <Overlay>
          <div className="grid w-full max-w-sm gap-3 border border-[#262832] bg-[#121318] p-7" style={{ fontFamily: MONO }}>
            <p className="text-[10px] tracking-[0.3em] text-[#8b8f9a]">FLIGHT SUSPENDED</p>
            <p className="mb-4 text-5xl italic" style={{ fontFamily: SERIF }}>
              Paused
            </p>
            <OverlayButton primary onClick={togglePause}>
              Resume · P
            </OverlayButton>
            <OverlayButton onClick={restart}>Restart · R</OverlayButton>
            <OverlayButton onClick={toMenu}>Hangar · Esc</OverlayButton>
          </div>
        </Overlay>
      )}

      {phase === "over" && summary && (
        <Overlay>
          <div className="grid w-full max-w-4xl gap-8 border border-[#262832] bg-[#121318] p-6 sm:p-8 md:grid-cols-[1.15fr_1fr]" style={{ fontFamily: MONO }}>
            <div className="flex flex-col gap-6">
              <div>
                <p className="text-[10px] tracking-[0.3em] text-[#8b8f9a]">
                  {summary.mode === "duel" ? "DUEL REPORT" : "RUN REPORT"}
                </p>
                <p className="mt-2 text-5xl italic leading-none" style={{ fontFamily: SERIF }}>
                  Run over
                </p>
                {summary.mode === "duel" && (
                  <p className="mt-3 text-xs tracking-[0.2em]" style={{ color: summary.players[summary.winner].color }}>
                    {summary.players[summary.winner].name} TAKES THE ARENA
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-px bg-[#262832]">
                {summary.players.map((pl, i) => (
                  <div key={pl.name + i} className="bg-[#0b0c0f] p-4">
                    <p className="text-[10px] tracking-[0.2em]" style={{ color: pl.color }}>
                      {pl.name}
                      {summary.mode === "duel" && i === summary.winner ? " · WINNER" : ""}
                    </p>
                    <p className="mt-2 text-3xl tabular-nums" style={{ fontFamily: SERIF }}>
                      {fmt(pl.score)}
                    </p>
                    <p className="mt-3 text-[11px] leading-relaxed text-[#8b8f9a]">
                      KILLS {pl.kills} · ECHO {pl.echoKills}
                      <br />
                      GRAZES {pl.grazes} · BEST ×{pl.bestCombo}
                    </p>
                    <p className="mt-2 text-[10px] tracking-[0.2em] text-[#8b8f9a]/70">{pl.alive ? "SURVIVED" : "DOWN"}</p>
                  </div>
                ))}
              </div>
              {summary.mode === "solo" && (
                <p className="text-[11px] tracking-[0.15em] text-[#8b8f9a]">
                  WAVE {summary.wave} · TIME {formatTime(summary.time)}
                </p>
              )}

              {reward && (
                <div className="border border-[#262832] p-4">
                  <p className="text-[10px] tracking-[0.25em] text-[#8b8f9a]">EARNED</p>
                  <p className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm tabular-nums">
                    <span className="text-2xl text-[#ffd166]" style={{ fontFamily: SERIF }}>
                      +{fmt(reward.runCoins + reward.firstBonus)} coins
                    </span>
                    {reward.firstBonus > 0 && <span className="text-[11px] text-[#8b8f9a]">incl. daily first-run +{reward.firstBonus}</span>}
                  </p>
                  {reward.completed.length > 0 ? (
                    <p className="mt-3 text-xs text-[#9dff5a]">
                      ORDER COMPLETE: {reward.completed.join(" · ").toUpperCase()} — claim in Orders
                    </p>
                  ) : (
                    <p className="mt-3 text-[11px] text-[#8b8f9a]">Orders progressed. Check the Orders tab in the hangar.</p>
                  )}
                </div>
              )}

              {newRecord && !saved && (
                <div className="border border-[#ffd166]/50 p-4">
                  <p className="text-[10px] tracking-[0.25em] text-[#ffd166]">NEW HIGH SCORE</p>
                  <p className="mt-1 text-xs text-[#8b8f9a]">Enter a callsign for the board.</p>
                </div>
              )}
              {saved && <p className="text-[11px] tracking-[0.2em] text-[#9dff5a]">LOGGED TO THE BOARD</p>}

              <form onSubmit={onSubmit} className="grid gap-3">
                {(newRecord || saved) && (
                  <label className="grid gap-1">
                    <span className="text-[10px] tracking-[0.25em] text-[#8b8f9a]">CALLSIGN · 12 MAX</span>
                    <input
                      value={name}
                      maxLength={12}
                      disabled={saved}
                      autoFocus={newRecord && !saved}
                      onChange={(e) => {
                        setName(e.target.value);
                        nameRef.current = e.target.value;
                      }}
                      className="border border-[#262832] bg-[#0b0c0f] px-4 py-2.5 text-[#ece8df] outline-none focus:border-[#ffd166] disabled:opacity-50"
                      placeholder="PILOT"
                    />
                  </label>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  <OverlayButton primary type="submit" disabled={!overReady}>
                    Play again · Enter
                  </OverlayButton>
                  <OverlayButton onClick={toMenu}>Hangar · Esc</OverlayButton>
                </div>
              </form>
            </div>

            <div className="flex min-w-0 flex-col gap-3">
              <p className="text-[10px] tracking-[0.25em] text-[#8b8f9a]">TOP 6 · LOCAL BOARD</p>
              <div className="border border-[#262832]">
                {scores.slice(0, 6).map((s, i) => {
                  const hl = saved && s.date === savedDate;
                  return (
                    <div
                      key={`${s.date}-${i}`}
                      className={`grid grid-cols-[28px_1fr_auto] items-center gap-3 border-b border-[#262832]/60 px-4 py-3 text-sm tabular-nums last:border-0 ${
                        hl ? "bg-[#ffd166]/10 text-[#ffd166]" : ""
                      }`}
                    >
                      <span className="text-[11px] text-[#8b8f9a]">{String(i + 1).padStart(2, "0")}</span>
                      <span className="truncate">{s.name}</span>
                      <span>{fmt(s.score)}</span>
                    </div>
                  );
                })}
                {scores.length === 0 && <p className="px-4 py-8 text-sm text-[#8b8f9a]">No runs logged yet.</p>}
              </div>
              <p className="mt-auto text-[10px] leading-relaxed text-[#8b8f9a]/70">
                {QUEST_POOL.length} possible daily orders · coins and boosters are saved on this device.
              </p>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}

function Overlay({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-[#0b0c0f]/80 p-4 backdrop-blur-[2px] sm:items-center">
      <div className="rise my-auto flex w-full justify-center">{children}</div>
    </div>
  );
}

function OverlayButton({
  children,
  onClick,
  primary,
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  primary?: boolean;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`h-11 border px-4 text-[11px] uppercase tracking-[0.18em] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        primary
          ? "border-[#ffd166] bg-[#ffd166] text-[#0b0c0f] hover:bg-[#ffe08f]"
          : "border-[#262832] text-[#ece8df] hover:border-[#ece8df]/60"
      }`}
      style={{ fontFamily: MONO }}
    >
      {children}
    </button>
  );
}

function formatTime(sec: number) {
  const s = Math.floor(sec);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

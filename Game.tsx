"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Engine } from "@/game/engine";
import { Renderer } from "@/game/render";
import { InputManager, emptyInput, type PlayerInput } from "@/game/input";
import { NetSession, type NetMsg } from "@/game/net";
import { MAP_COUNT } from "@/game/map";
import MainMenu from "@/components/Menu";
import {
  loadProfile, applyRun, saveProfile, readScores, LS_SCORES,
  type Profile, type LocalScore,
} from "@/game/meta";
import type {
  Difficulty, EndPayload, HudData, Mode, Role, SessionSetup, Snapshot,
} from "@/game/types";

type Screen = "menu" | "lobby" | "playing" | "paused" | "over";

const LS_MUTED = "hollow.muted";
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
const opposite = (r: Role): Role => (r === "survivor" ? "killer" : "survivor");

function KeyCap({ k }: { k: string }) {
  return <span className="keycap">{k}</span>;
}

function CountUp({ value }: { value: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / 900);
      setV(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{v.toLocaleString("fr-FR")}</>;
}

function FuseSlots({ count, needed }: { count: number; needed: number }) {
  return (
    <div className="flex gap-1.5 items-center">
      {Array.from({ length: needed }).map((_, i) => (
        <span key={`${i}-${i < count}`} className={`fuse-slot ${i < count ? "fuse-on" : ""}`} />
      ))}
    </div>
  );
}

function Stamina({ value, exhausted, label }: { value: number; exhausted: boolean; label: string }) {
  return (
    <div className="w-36 max-w-[38vw]">
      <div className="text-[9px] tracking-[0.2em] text-bone/50 mb-0.5">{label}</div>
      <div className="h-1.5 bg-black/60 border border-white/10 overflow-hidden">
        <div
          className={`h-full transition-[width] duration-150 ${exhausted ? "bg-blood-bright stamina-flash" : "bg-teal-ghost"}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function Zone({ input, className }: { input: InputManager; className: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return input.attachZone(el);
  }, [input]);
  return <div ref={ref} className={`joy-zone ${className}`} />;
}

function TouchBtn({ label, sub, onDown, onUp, dim, big }: {
  label: string; sub?: string; onDown: () => void; onUp?: () => void; dim?: boolean; big?: boolean;
}) {
  return (
    <button
      className={`touch-btn ${big ? "touch-btn-big" : ""} ${dim ? "opacity-40" : ""}`}
      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onDown(); }}
      onPointerUp={() => onUp?.()}
      onPointerLeave={() => onUp?.()}
      onPointerCancel={() => onUp?.()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span>{label}</span>
      {sub && <em>{sub}</em>}
    </button>
  );
}

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const inputRef = useRef<InputManager | null>(null);
  const netRef = useRef<NetSession | null>(null);
  const lastSetupRef = useRef<SessionSetup | null>(null);
  const countersRef = useRef({ ac: 0, sc: 0, tc: 0, fc: 0 });
  const remoteRef = useRef({ mx: 0, my: 0, sprint: false, ac: 0, sc: 0, tc: 0, fc: 0, pac: 0, psc: 0, ptc: 0, pfc: 0 });
  const remoteCosRef = useRef<{ skin: string; lamp: string } | null>(null);
  const netAccRef = useRef(0);
  const lastInputAtRef = useRef(0);
  const netLostRef = useRef<string | null>(null);
  const profileRef = useRef<Profile | null>(null);

  const [screen, setScreen] = useState<Screen>("menu");
  const screenRef = useRef<Screen>("menu");
  screenRef.current = screen;

  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>("solo");
  const [diff, setDiff] = useState<Difficulty>("normal");
  const [muted, setMuted] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [hud, setHud] = useState<HudData | null>(null);
  const [end, setEnd] = useState<EndPayload | null>(null);
  const [jumpscare, setJumpscare] = useState(false);
  const [scores, setScores] = useState<LocalScore[]>([]);
  const [highlightId, setHighlightId] = useState(0);
  const [name, setName] = useState("SURVIVANT");
  const [carved, setCarved] = useState<"no" | "saving" | "yes" | "offline">("no");
  const [series, setSeries] = useState({ butcher: 0, survivor: 0 });

  const [profile, setProfile] = useState<Profile | null>(null);
  profileRef.current = profile;
  const [bonusToast, setBonusToast] = useState(0);
  const [lastEarn, setLastEarn] = useState(0);

  // en ligne
  const [hostRole, setHostRole] = useState<Role>("survivor");
  const [lobbyCode, setLobbyCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [guestJoined, setGuestJoined] = useState(false);
  const [netBusy, setNetBusy] = useState<"idle" | "creating" | "joining">("idle");
  const [netErr, setNetErr] = useState("");
  const [netLost, setNetLost] = useState<string | null>(null);
  const [quitConfirm, setQuitConfirm] = useState(false);
  const [copied, setCopied] = useState(false);

  const markNetLost = useCallback((msg: string) => {
    netLostRef.current = msg;
    setNetLost(msg);
    if (engineRef.current) engineRef.current.paused = true;
    if (inputRef.current) inputRef.current.active = false;
  }, []);

  const click = useCallback(() => {
    engineRef.current?.audio.ensure();
    engineRef.current?.audio.click();
  }, []);

  // ── messages réseau ──
  const handleNet = useCallback((m: NetMsg) => {
    const eng = engineRef.current;
    const net = netRef.current;
    const input = inputRef.current;
    if (!eng || !net) return;
    switch (m.type) {
      case "hello":
        if (m.guestJoined) setGuestJoined(true);
        break;
      case "guest-joined": {
        setGuestJoined(true);
        lastInputAtRef.current = Date.now();
        if (net.side === "host" && lastSetupRef.current &&
          (screenRef.current === "playing" || screenRef.current === "over")) {
          net.send("start", lastSetupRef.current as unknown as Record<string, unknown>);
          if (eng.survivor) net.send("state", eng.snapshot() as unknown as Record<string, unknown>);
        }
        break;
      }
      case "guest-left":
        setGuestJoined(false);
        if (screenRef.current === "playing" || screenRef.current === "lobby") {
          markNetLost("Votre adversaire a quitté la session.");
        }
        break;
      case "input": {
        const r = remoteRef.current;
        r.mx = Number(m.mx) || 0; r.my = Number(m.my) || 0;
        r.sprint = m.sprint === true;
        r.ac = Number(m.ac) || 0; r.sc = Number(m.sc) || 0;
        r.tc = Number(m.tc) || 0; r.fc = Number(m.fc) || 0;
        lastInputAtRef.current = Date.now();
        break;
      }
      case "cosmetics": {
        if (net.side !== "host") break;
        const skin = String(m.skin ?? "");
        const lamp = String(m.lamp ?? "ambre");
        remoteCosRef.current = { skin, lamp };
        const prof = profileRef.current;
        if (eng.config.localRole === "survivor") {
          eng.applyCosmetics(prof?.equipped.survivor ?? "recrue", skin || "boucher", prof?.equipped.lamp ?? "ambre");
        } else {
          eng.applyCosmetics(skin || "recrue", prof?.equipped.killer ?? "boucher", lamp);
        }
        break;
      }
      case "state":
        if (net.side === "guest" && eng.survivor) eng.applySnapshot(m as unknown as Snapshot);
        break;
      case "start": {
        if (net.side !== "guest") break;
        const setup = m as unknown as SessionSetup;
        eng.audio.ensure();
        const myRole = opposite(setup.hostRole);
        const prof = profileRef.current;
        const mySkin = prof?.equipped[myRole] ?? (myRole === "survivor" ? "recrue" : "boucher");
        const myLamp = prof?.equipped.lamp ?? "ambre";
        eng.startRun(
          { mode: "online", difficulty: setup.difficulty, localRole: myRole, variant: setup.variant },
          { fuses: setup.fuses, weapons: setup.weapons },
        );
        eng.applyCosmetics(
          setup.hostRole === "survivor" ? setup.hostSkin : mySkin,
          setup.hostRole === "killer" ? setup.hostSkin : mySkin,
          setup.hostRole === "survivor" ? setup.hostLamp : myLamp,
        );
        eng.remote = true;
        net.send("cosmetics", { skin: mySkin, lamp: myLamp });
        countersRef.current = { ac: 0, sc: 0, tc: 0, fc: 0 };
        netLostRef.current = null;
        setNetLost(null); setEnd(null); setQuitConfirm(false);
        setHud(eng.getHud());
        if (input) input.active = true;
        setScreen("playing");
        break;
      }
      case "end": {
        if (net.side !== "guest") break;
        const host = m.payload as unknown as EndPayload;
        const p: EndPayload = { ...host, config: { ...host.config, localRole: opposite(host.config.localRole) } };
        setEnd(p);
        setSeries((s) => p.killerWinner ? { ...s, butcher: s.butcher + 1 } : { ...s, survivor: s.survivor + 1 });
        const isK = p.config.localRole === "killer";
        const mine = isK
          ? { ...p.stats, fuses: 0, stuns: 0, closeCalls: 0, hides: 0, flares: 0, escaped: false }
          : p.stats;
        const soulScore = isK ? (p.killerWinner ? 800 + p.score.timeSec * 2 : 150) : p.score.total;
        const res = applyRun(profileRef.current ?? loadProfile().profile, mine, soulScore);
        setProfile(res.profile);
        setLastEarn(res.earned);
        if (input) input.active = false;
        setScreen("over");
        break;
      }
      case "bye":
        markNetLost("L'hôte a fermé la session.");
        break;
      default:
        break;
    }
  }, [markNetLost]);

  // ── démarrage moteur / rendu / entrées ──
  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const engine = new Engine();
    const renderer = new Renderer(canvas);
    const input = new InputManager();
    input.attach();
    engineRef.current = engine; rendererRef.current = renderer; inputRef.current = input;

    try {
      setMuted(localStorage.getItem(LS_MUTED) === "1");
      if (localStorage.getItem("hollow.diff") === "nightmare") setDiff("nightmare");
      setScores(readScores());
    } catch { /* mode privé */ }
    const loaded = loadProfile();
    setProfile(loaded.profile);
    setName(loaded.profile.name);
    if (loaded.bonus > 0) {
      setBonusToast(loaded.bonus);
      window.setTimeout(() => setBonusToast(0), 4500);
    }
    setIsTouch(typeof window !== "undefined" && (navigator.maxTouchPoints > 0 || "ontouchstart" in window));

    let disposed = false;
    void renderer.init().then(() => {
      if (disposed) return;
      renderer.buildWorld(engine.map);
      renderer.resize(wrap.clientWidth, wrap.clientHeight);
      setReady(true);
    });
    const ro = new ResizeObserver(() => renderer.resize(wrap.clientWidth, wrap.clientHeight));
    ro.observe(wrap);

    engine.onEvent = (e) => {
      if (e.type === "caught-flash") {
        setJumpscare(true);
        window.setTimeout(() => setJumpscare(false), 1000);
      } else if (e.type === "end") {
        const p = e.payload;
        setEnd(p);
        setCarved("no");
        const isK = p.config.localRole === "killer";
        const mine = isK
          ? { ...p.stats, fuses: 0, stuns: 0, closeCalls: 0, hides: 0, flares: 0, escaped: false }
          : p.stats;
        const soulScore = isK ? (p.killerWinner ? 800 + p.score.timeSec * 2 : 150) : p.score.total;
        const res = applyRun(profileRef.current ?? loadProfile().profile, mine, soulScore);
        setProfile(res.profile);
        setLastEarn(res.earned);
        if (p.config.mode === "online") {
          setSeries((s) => p.killerWinner ? { ...s, butcher: s.butcher + 1 } : { ...s, survivor: s.survivor + 1 });
          netRef.current?.send("end", { payload: p } as unknown as Record<string, unknown>);
        } else {
          const entry: LocalScore = {
            id: Date.now(), name: profileRef.current?.name ?? "SURVIVANT", score: p.score.total,
            fuses: p.score.fuses, timeSec: p.score.timeSec, diff: p.config.difficulty,
            escaped: p.score.escaped, date: new Date().toLocaleDateString("fr-FR"),
          };
          setScores((prev) => {
            const next = [...prev, entry].sort((a, b) => b.score - a.score).slice(0, 8);
            try { localStorage.setItem(LS_SCORES, JSON.stringify(next)); } catch { /* noop */ }
            return next;
          });
          setHighlightId(entry.id);
        }
        input.active = false;
        setScreen("over");
      }
    };

    let raf = 0, last = performance.now(), frame = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const scr = screenRef.current;
      const eng = engineRef.current, rnd = rendererRef.current;
      if ((scr !== "playing" && scr !== "paused" && scr !== "over") || !eng || !rnd || !eng.survivor) return;

      if (netLostRef.current) { rnd.render(eng, dt); return; }

      const cfg = eng.config;
      const net = netRef.current;
      if (cfg.mode === "online" && net) {
        const li = input.sample("online", cfg.localRole);
        if (net.side === "guest") {
          const c = countersRef.current;
          if (li.actionQ) c.ac++;
          if (li.senseQ) c.sc++;
          if (li.taserQ) c.tc++;
          if (li.flareQ) c.fc++;
          eng.updateRemote(dt, li);
          netAccRef.current += dt;
          if (netAccRef.current >= 0.07) {
            netAccRef.current = 0;
            net.send("input", { mx: li.mx, my: li.my, sprint: li.sprint, ac: c.ac, sc: c.sc, tc: c.tc, fc: c.fc });
          }
        } else {
          const r = remoteRef.current;
          const ri: PlayerInput = {
            mx: r.mx, my: r.my, sprint: r.sprint,
            actionQ: r.ac > r.pac, senseQ: r.sc > r.psc, taserQ: r.tc > r.ptc, flareQ: r.fc > r.pfc,
          };
          r.pac = r.ac; r.psc = r.sc; r.ptc = r.tc; r.pfc = r.fc;
          const inputs = cfg.localRole === "survivor"
            ? { survivor: li, killer: ri }
            : { survivor: ri, killer: li };
          eng.update(dt, inputs);
          netAccRef.current += dt;
          if (netAccRef.current >= 0.07) {
            netAccRef.current = 0;
            net.send("state", eng.snapshot() as unknown as Record<string, unknown>);
          }
          if (scr === "playing" && lastInputAtRef.current && Date.now() - lastInputAtRef.current > 12000) {
            markNetLost("L'adversaire ne répond plus…");
          }
        }
      } else {
        const li = input.sample("solo", "survivor");
        eng.update(dt, { survivor: li, killer: emptyInput() });
      }
      rnd.render(eng, dt);
      if (++frame % 5 === 0 && scr === "playing") setHud(eng.getHud());
    };
    raf = requestAnimationFrame(loop);

    const onVis = () => {
      if (document.hidden && screenRef.current === "playing" && engineRef.current?.config.mode === "solo") {
        engine.paused = true;
        engine.audio.setDuck(0.25);
        input.active = false;
        setScreen("paused");
      }
    };
    const onTouchDetect = (e: PointerEvent) => { if (e.pointerType === "touch") setIsTouch(true); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pointerdown", onTouchDetect);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      input.destroy();
      netRef.current?.close();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointerdown", onTouchDetect);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── actions ──
  const startSolo = useCallback(() => {
    const eng = engineRef.current, input = inputRef.current;
    if (!eng || !input) return;
    eng.audio.ensure();
    eng.audio.setMuted(muted);
    eng.startRun({ mode: "solo", difficulty: diff, localRole: "survivor", variant: (Math.random() * MAP_COUNT) | 0 });
    const prof = profileRef.current;
    eng.applyCosmetics(prof?.equipped.survivor ?? "recrue", prof?.equipped.killer ?? "boucher", prof?.equipped.lamp ?? "ambre");
    input.active = true;
    setEnd(null); setHud(eng.getHud()); setJumpscare(false);
    setScreen("playing");
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }, [muted, diff]);

  const startOnlineHost = useCallback(() => {
    const eng = engineRef.current, input = inputRef.current, net = netRef.current;
    if (!eng || !input || !net) return;
    eng.audio.ensure();
    eng.audio.setMuted(muted);
    const variant = (Math.random() * MAP_COUNT) | 0;
    eng.startRun({ mode: "online", difficulty: "normal", localRole: hostRole, variant });
    const prof = profileRef.current;
    const mySkin = prof?.equipped[hostRole] ?? (hostRole === "survivor" ? "recrue" : "boucher");
    const myLamp = prof?.equipped.lamp ?? "ambre";
    eng.applyCosmetics(
      hostRole === "survivor" ? mySkin : "recrue",
      hostRole === "killer" ? mySkin : "boucher",
      hostRole === "survivor" ? myLamp : "ambre",
    );
    const setup: SessionSetup = {
      difficulty: "normal", variant, hostRole,
      fuses: eng.fuses.map((f) => ({ x: f.x, y: f.y })),
      weapons: eng.weapons.map((w) => ({ x: w.x, y: w.y, kind: w.kind })),
      hostSkin: mySkin, hostLamp: myLamp,
    };
    lastSetupRef.current = setup;
    countersRef.current = { ac: 0, sc: 0, tc: 0, fc: 0 };
    remoteRef.current = { mx: 0, my: 0, sprint: false, ac: 0, sc: 0, tc: 0, fc: 0, pac: 0, psc: 0, ptc: 0, pfc: 0 };
    lastInputAtRef.current = Date.now();
    net.send("start", setup as unknown as Record<string, unknown>);
    net.send("state", eng.snapshot() as unknown as Record<string, unknown>);
    netLostRef.current = null;
    setNetLost(null); setEnd(null); setQuitConfirm(false);
    input.active = true;
    setHud(eng.getHud());
    setScreen("playing");
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }, [muted, hostRole]);

  const createSession = useCallback(async () => {
    if (netBusy !== "idle") return;
    setNetBusy("creating"); setNetErr("");
    engineRef.current?.audio.ensure();
    try {
      const net = await NetSession.create(hostRole);
      netRef.current = net;
      net.onMsg = handleNet;
      net.onLost = () => markNetLost("Connexion perdue avec la session.");
      net.connect();
      setLobbyCode(net.code);
      setGuestJoined(false);
      setScreen("lobby");
    } catch {
      setNetErr("Impossible de créer la session. Réessayez.");
    }
    setNetBusy("idle");
  }, [netBusy, hostRole, handleNet, markNetLost]);

  const joinSession = useCallback(async () => {
    if (netBusy !== "idle" || joinCode.trim().length < 4) return;
    setNetBusy("joining"); setNetErr("");
    engineRef.current?.audio.ensure();
    try {
      const net = await NetSession.join(joinCode);
      netRef.current = net;
      net.onMsg = handleNet;
      net.onLost = () => markNetLost("Connexion perdue avec la session.");
      net.connect();
      setLobbyCode(net.code);
      setGuestJoined(true);
      setScreen("lobby");
    } catch (e) {
      setNetErr(e instanceof Error ? e.message : "Session introuvable.");
    }
    setNetBusy("idle");
  }, [netBusy, joinCode, handleNet, markNetLost]);

  const cleanupNet = useCallback(() => {
    netRef.current?.close();
    netRef.current = null;
    lastSetupRef.current = null;
    remoteCosRef.current = null;
    netLostRef.current = null;
    setNetLost(null); setGuestJoined(false); setQuitConfirm(false); setLobbyCode("");
  }, []);

  const pauseGame = useCallback(() => {
    const eng = engineRef.current, input = inputRef.current;
    if (!eng || !input) return;
    if (eng.config.mode === "online") { setQuitConfirm(true); return; }
    eng.paused = true; eng.audio.setDuck(0.25);
    input.active = false;
    eng.audio.click();
    setScreen("paused");
  }, []);

  const resumeGame = useCallback(() => {
    const eng = engineRef.current, input = inputRef.current;
    if (!eng || !input) return;
    eng.audio.ensure();
    eng.paused = false; eng.audio.setDuck(1);
    input.active = true;
    eng.audio.click();
    setScreen("playing");
  }, []);

  const quitToMenu = useCallback(() => {
    cleanupNet();
    const eng = engineRef.current, input = inputRef.current;
    if (eng) { eng.paused = true; eng.audio.setDuck(0.5); }
    if (input) input.active = false;
    setScores(readScores());
    setScreen("menu");
  }, [cleanupNet]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      engineRef.current?.audio.setMuted(next);
      try { localStorage.setItem(LS_MUTED, next ? "1" : "0"); } catch { /* noop */ }
      return next;
    });
  }, []);

  const onRename = useCallback((n: string) => {
    const prof = profileRef.current;
    if (!prof) return;
    const np = { ...prof, name: n };
    saveProfile(np);
    setProfile(np);
    setName(n);
  }, []);

  // raccourcis globaux
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) {
        if (e.code === "Escape") (e.target as HTMLInputElement).blur();
        return;
      }
      const scr = screenRef.current;
      const eng = engineRef.current;
      if (e.code === "KeyM") { toggleMute(); return; }
      if (e.code === "Escape" || e.code === "KeyP") {
        if (scr === "playing") {
          if (eng?.config.mode === "online") setQuitConfirm((q) => !q);
          else pauseGame();
        }
        else if (scr === "paused") resumeGame();
        else if (scr === "over") quitToMenu();
        else if (scr === "lobby") quitToMenu();
        return;
      }
      if (e.code === "KeyR") {
        if (scr === "paused" && eng?.config.mode === "solo") startSolo();
        else if (scr === "over") {
          if (eng?.config.mode === "online") {
            if (netRef.current?.side === "host" && guestJoined) startOnlineHost();
          } else startSolo();
        }
        return;
      }
      if (e.code === "Enter" && scr === "menu" && ready && mode === "solo") startSolo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pauseGame, resumeGame, quitToMenu, startSolo, startOnlineHost, toggleMute, mode, ready, guestJoined]);

  const carveName = useCallback(async () => {
    if (!end || carved === "saving" || carved === "yes") return;
    const nm = (name.trim() || "SURVIVANT").slice(0, 12).toUpperCase();
    setName(nm);
    onRename(nm);
    try {
      const next = readScores().map((s) => (s.id === highlightId ? { ...s, name: nm } : s));
      localStorage.setItem(LS_SCORES, JSON.stringify(next));
      setScores(next);
    } catch { /* noop */ }
    setCarved("saving");
    try {
      const r = await fetch("/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nm, score: end.score.total, fuses: end.score.fuses,
          timeSec: end.score.timeSec, difficulty: end.config.difficulty, escaped: end.score.escaped,
        }),
      });
      setCarved(r.ok ? "yes" : "offline");
    } catch { setCarved("offline"); }
  }, [end, name, highlightId, carved, onRename]);

  const copyCode = useCallback(() => {
    void navigator.clipboard?.writeText(lobbyCode).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }, [lobbyCode]);

  const input = inputRef.current;
  const eng = engineRef.current;
  const isOnline = eng?.config.mode === "online";
  const isKiller = hud?.role === "killer";
  const netSide = netRef.current?.side;
  const inGame = screen === "playing" || screen === "paused";

  return (
    <div ref={wrapRef} className={`fixed inset-0 overflow-hidden bg-[#04050a] select-none ${jumpscare ? "ui-shake" : ""}`}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* ── HUD ── */}
      {inGame && hud && (
        <div className="absolute inset-0 pointer-events-none z-20">
          <div className="absolute top-0 inset-x-0 flex items-start justify-between px-3 pt-2 gap-2">
            <div className="hud-panel">
              <div className={`text-[10px] tracking-[0.25em] ${isKiller ? "text-blood-bright" : "text-teal-ghost"}`}>
                {isOnline ? (isKiller ? "VOUS · LE BOUCHER" : "VOUS · LE SURVIVANT") : "LE SURVIVANT"}
                <span className="text-bone/35"> · {eng?.map.name}</span>
              </div>
              {!isKiller ? (
                <>
                  <div className="flex gap-2 items-center">
                    <FuseSlots count={hud.fuses} needed={hud.needed} />
                    <div className="hud-score text-sm">{hud.score.toLocaleString("fr-FR")}</div>
                  </div>
                  <Stamina value={hud.staminaS} exhausted={hud.exhaustedS} label="ENDURANCE" />
                  <div className="flex gap-2 mt-0.5">
                    <span className={`weapon-chip weapon-taser ${hud.taser === 0 ? "weapon-empty" : ""}`}>
                      ⚡ TASER ×{hud.taser}{!isTouch && <KeyCap k="F" />}
                    </span>
                    <span className={`weapon-chip weapon-flare ${hud.flare === 0 ? "weapon-empty" : ""}`}>
                      🔥 FUSÉE ×{hud.flare}{!isTouch && <KeyCap k="G" />}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <Stamina value={hud.staminaK} exhausted={hud.exhaustedK} label="ENDURANCE" />
                  <div className="flex gap-2 items-center text-[9px] tracking-[0.15em] text-bone/55">
                    <span className={hud.attackReady >= 1 ? "text-bone" : "opacity-50"}>
                      🔪 FRAPPER {!isTouch && <KeyCap k="ESPACE" />}
                    </span>
                    <span className={hud.senseReady >= 1 ? "text-blood-bright" : "opacity-50"}>
                      👁 SENS {!isTouch && <KeyCap k="Q" />}
                    </span>
                  </div>
                  {hud.stunned && <div className="text-[10px] tracking-[0.25em] text-[#9fd8ff] stamina-flash">⚡ ÉTOURDI !</div>}
                </>
              )}
            </div>
            <div className="flex items-center gap-2 pointer-events-auto">
              {isOnline && (
                <div className="hud-panel !py-1.5 text-[9px] tracking-[0.2em] text-bone/60">
                  <span className="net-dot" /> EN LIGNE · {lobbyCode}
                </div>
              )}
              <div className={`hud-panel hud-timer ${hud.countdown && hud.timeLabel.startsWith("0:") && parseInt(hud.timeLabel.slice(2)) <= 10 ? "timer-low" : ""}`}>
                {hud.timeLabel}
              </div>
              <button className="icon-btn" onClick={pauseGame} aria-label="pause">{isOnline ? "✕" : "❚❚"}</button>
              <button className="icon-btn" onClick={toggleMute} aria-label="son">{muted ? "🔇" : "🔊"}</button>
            </div>
          </div>

          {hud.hidden && (
            <div className="absolute top-24 inset-x-0 flex justify-center">
              <div className="hidden-badge">CACHÉ · RETENEZ VOTRE SOUFFLE</div>
            </div>
          )}

          {hud.prompt && !hud.hidden && (
            <div className="absolute bottom-[30%] landscape:bottom-[16%] inset-x-0 flex justify-center">
              <div className="prompt-bar">
                {!isTouch && hud.prompt.includes("CASIER") && <KeyCap k="E" />}
                <span>{hud.prompt}</span>
              </div>
            </div>
          )}
          {hud.hidden && !isTouch && (
            <div className="absolute bottom-[30%] landscape:bottom-[16%] inset-x-0 flex justify-center">
              <div className="prompt-bar"><KeyCap k="E" /><span>SORTIR DU CASIER</span></div>
            </div>
          )}

          {isTouch && input && screen === "playing" && (
            <>
              <Zone input={input} className="absolute left-0 bottom-0 w-[52%] h-[60%]" />
              <div className="absolute right-3 bottom-5 grid grid-cols-2 gap-2.5 pointer-events-auto items-end justify-items-center">
                {!isKiller ? (
                  <>
                    <TouchBtn label="TASER" sub={`×${hud.taser}`} dim={hud.taser === 0} onDown={() => input.setTouchBtn("taser", true)} />
                    <TouchBtn label="FUSÉE" sub={`×${hud.flare}`} dim={hud.flare === 0} onDown={() => input.setTouchBtn("flare", true)} />
                    <TouchBtn label={hud.hidden ? "SORTIR" : "CACHER"} onDown={() => input.setTouchBtn("action", true)} />
                    <TouchBtn big label="COURIR" sub="maintenir" onDown={() => input.setTouchBtn("sprint", true)} onUp={() => input.setTouchBtn("sprint", false)} />
                  </>
                ) : (
                  <>
                    <TouchBtn label="SENS" sub={hud.senseReady >= 1 ? "prêt" : "…"} dim={hud.senseReady < 1} onDown={() => input.setTouchBtn("sense", true)} />
                    <TouchBtn label="COURIR" sub="maintenir" onDown={() => input.setTouchBtn("sprint", true)} onUp={() => input.setTouchBtn("sprint", false)} />
                    <div />
                    <TouchBtn big label="FRAPPER" dim={hud.attackReady < 1} onDown={() => input.setTouchBtn("action", true)} />
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── JUMPSCARE ── */}
      {jumpscare && (
        <div className="absolute inset-0 z-50 pointer-events-none jumpscare-wrap">
          <div className="jumpscare-flash" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/jumpscare.jpg" alt="" className="jumpscare-img" />
        </div>
      )}

      {/* ── PRIME DU JOUR ── */}
      {bonusToast > 0 && (
        <div className="bonus-toast">PRIME DU JOUR · +{bonusToast} ÂMES</div>
      )}

      {/* ── MENU ── */}
      {screen === "menu" && profile && (
        <MainMenu
          ready={ready} muted={muted} onToggleMute={toggleMute} click={click}
          profile={profile} onProfile={setProfile}
          mode={mode} setMode={setMode} diff={diff} setDiff={setDiff}
          hostRole={hostRole} setHostRole={setHostRole}
          joinCode={joinCode} setJoinCode={setJoinCode}
          netBusy={netBusy} netErr={netErr}
          onCreate={() => void createSession()} onJoin={() => void joinSession()} onStartSolo={startSolo}
          scores={scores} highlightId={highlightId}
          onRename={onRename}
        />
      )}

      {/* ── LOBBY EN LIGNE ── */}
      {screen === "lobby" && (
        <div className="absolute inset-0 z-30 overflow-y-auto menu-scroll">
          <div className="menu-bg" />
          <div className="menu-fog menu-fog-a" />
          <div className="relative min-h-full flex items-center justify-center px-4 py-8">
            <div className="panel max-w-md w-full text-center">
              <div className="text-[10px] tracking-[0.4em] text-bone/40 mb-2">SESSION EN LIGNE</div>
              {netSide === "host" ? (
                <>
                  <h2 className="panel-title text-bone !text-xl">PARTAGEZ LE CODE</h2>
                  <div className="code-display" onClick={copyCode} title="copier">{lobbyCode}</div>
                  <button className="ghost-btn w-full mb-4" onClick={copyCode}>{copied ? "COPIÉ ✓" : "COPIER LE CODE"}</button>
                  <div className="text-xs text-bone/60 font-type mb-1">
                    Votre rôle : <b className={hostRole === "killer" ? "text-blood-bright" : "text-teal-ghost"}>{hostRole === "killer" ? "LE BOUCHER 🔪" : "LE SURVIVANT 🕯️"}</b>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-xs font-type mb-5">
                    <span className={`net-dot ${guestJoined ? "" : "net-dot-wait"}`} />
                    {guestJoined ? <span className="text-green-ghost">Un second joueur est connecté !</span> : <span className="text-bone/50 lobby-pulse">En attente d'un second joueur…</span>}
                  </div>
                  <button className="start-btn !text-base w-full" disabled={!guestJoined} onClick={startOnlineHost}>
                    {guestJoined ? "LANCER LA CHASSE" : "EN ATTENTE…"}
                  </button>
                </>
              ) : (
                <>
                  <h2 className="panel-title text-bone !text-xl">SESSION {lobbyCode}</h2>
                  <div className="text-xs text-bone/60 font-type mb-1">
                    Votre rôle : <b className={hostRole === "killer" ? "text-teal-ghost" : "text-blood-bright"}>{hostRole === "killer" ? "LE SURVIVANT 🕯️" : "LE BOUCHER 🔪"}</b>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-xs font-type mb-5 mt-3">
                    <span className="net-dot net-dot-wait" />
                    <span className="text-bone/50 lobby-pulse">En attente du lancement par l'hôte…</span>
                  </div>
                  <div className="text-[10px] text-bone/40 font-type mb-4">La chasse commencera automatiquement.</div>
                </>
              )}
              <button className="ghost-btn w-full mt-3" onClick={quitToMenu}>ANNULER · ESC</button>
            </div>
          </div>
        </div>
      )}

      {/* ── PAUSE (solo) ── */}
      {screen === "paused" && (
        <div className="absolute inset-0 z-40 overlay-dark flex items-center justify-center px-4">
          <div className="panel max-w-sm w-full text-center">
            <h2 className="panel-title text-bone">IL VOUS ATTEND</h2>
            <p className="text-bone/50 text-xs mb-5 font-type">le boucher ne fait pas de pause. vous, si.</p>
            <div className="flex flex-col gap-2">
              <button className="start-btn !text-base !py-3" onClick={resumeGame}>REPRENDRE · ESC</button>
              <button className="ghost-btn" onClick={startSolo}>RECOMMENCER · R</button>
              <button className="ghost-btn" onClick={quitToMenu}>ABANDONNER · MENU</button>
              <button className="ghost-btn" onClick={toggleMute}>{muted ? "🔇 RÉACTIVER LE SON" : "🔊 COUPER LE SON"} · M</button>
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIRMATION QUITTER (en ligne) ── */}
      {quitConfirm && screen === "playing" && (
        <div className="absolute inset-0 z-40 overlay-dark flex items-center justify-center px-4">
          <div className="panel max-w-sm w-full text-center">
            <h2 className="panel-title text-blood-bright !text-xl">QUITTER LA SESSION ?</h2>
            <p className="text-bone/50 text-xs mb-5 font-type">la chasse continue sans vous. l'asile ne pardonne pas.</p>
            <div className="flex flex-col gap-2">
              <button className="start-btn !text-base !py-3" onClick={() => setQuitConfirm(false)}>RESTER</button>
              <button className="ghost-btn" onClick={quitToMenu}>QUITTER · FERMER LA SESSION</button>
            </div>
          </div>
        </div>
      )}

      {/* ── CONNEXION PERDUE ── */}
      {netLost && (
        <div className="absolute inset-0 z-[60] overlay-dark flex items-center justify-center px-4">
          <div className="panel max-w-sm w-full text-center">
            <h2 className="panel-title text-blood-bright !text-xl">SIGNAL PERDU</h2>
            <p className="text-bone/60 text-sm mb-5 font-type">{netLost}</p>
            <button className="start-btn !text-base !py-3 w-full" onClick={quitToMenu}>RETOUR AU MENU</button>
          </div>
        </div>
      )}

      {/* ── FIN DE PARTIE ── */}
      {screen === "over" && end && (
        <div className="absolute inset-0 z-40 overlay-dark overflow-y-auto menu-scroll">
          <div className="min-h-full flex items-center justify-center px-4 py-8">
            <div className="panel max-w-md w-full text-center">
              <div className="text-[10px] tracking-[0.4em] text-bone/40 mb-1">
                {end.config.mode === "online"
                  ? `MANCHE TERMINÉE · BOUCHER ${series.butcher} — ${series.survivor} SURVIVANT`
                  : end.config.difficulty === "nightmare" ? "CAUCHEMAR" : "ANGOISSE"}
              </div>
              <h2 className={`panel-title ${end.reason === "escaped" ? "text-green-ghost" : "text-blood-bright"}`}>
                {end.config.mode === "online"
                  ? end.killerWinner
                    ? (end.config.localRole === "killer" ? "VOUS L'AVEZ PRIS" : "LE BOUCHER VOUS A PRIS")
                    : (end.config.localRole === "survivor" ? "VOUS VOUS ÊTES ÉCHAPPÉ" : "IL S'EST ÉCHAPPÉ")
                  : end.reason === "escaped" ? "VOUS VOUS ÊTES ÉCHAPPÉ" : "VOUS AVEZ ÉTÉ PRIS"}
              </h2>
              <p className="text-bone/50 text-xs mb-4 font-type">
                {end.reason === "escaped" ? "l'air de la nuit n'a jamais été aussi doux"
                  : end.reason === "timeup" ? "trois minutes d'espoir, consumées"
                  : "il vous a ajouté aux murs"}
              </p>

              <div className="score-total"><CountUp value={end.score.total} /></div>
              <div className="text-[10px] tracking-[0.3em] text-bone/40 mb-3">MONNAIE DES ÂMES</div>

              {lastEarn > 0 && (
                <div className="souls-earned">🕯️ ÂMES RÉCOLTÉES <b>+{lastEarn}</b>
                  <span className="text-bone/40 text-[9px] ml-2">solde : {profile?.souls.toLocaleString("fr-FR")}</span>
                </div>
              )}

              <div className="breakdown mt-3">
                <div><span>⚡ fusibles × {end.score.fuses}</span><b>+{end.score.fusePts}</b></div>
                {end.score.chainPts > 0 && <div><span>⛓ bonus de chaîne</span><b>+{end.score.chainPts}</b></div>}
                {end.score.closePts > 0 && <div><span>🩸 frôlements × {end.score.closeCalls}</span><b>+{end.score.closePts}</b></div>}
                {end.score.stunPts > 0 && <div><span>⚡ parades × {end.score.stuns}</span><b>+{end.score.stunPts}</b></div>}
                {end.score.escapePts > 0 && <div><span>🚪 évasion</span><b>+{end.score.escapePts}</b></div>}
                {end.score.timePts > 0 && <div><span>⏱ bonus de temps</span><b>+{end.score.timePts}</b></div>}
                <div><span>⏳ survécu</span><b>{fmtTime(end.score.timeSec)}</b></div>
                {end.score.mult > 1 && <div className="text-blood-bright"><span>☠ cauchemar</span><b>×{end.score.mult}</b></div>}
              </div>

              {end.config.mode === "solo" && (
                <div className="mt-4 mb-1">
                  <div className="flex gap-2">
                    <input
                      className="name-input" value={name} maxLength={12}
                      onChange={(e) => setName(e.target.value.toUpperCase())}
                      placeholder="VOTRE NOM"
                    />
                    <button className="carve-btn" onClick={() => void carveName()} disabled={carved === "saving" || carved === "yes"}>
                      {carved === "yes" ? "GRAVÉ ✓" : carved === "offline" ? "LOCAL ✓" : carved === "saving" ? "…" : "GRAVER"}
                    </button>
                  </div>
                  <div className="text-[9px] text-bone/35 mt-1 font-type">gravez votre nom dans le registre des âmes</div>
                </div>
              )}

              {end.config.mode === "solo" && scores.length > 0 && (
                <div className="board-panel mt-3 text-left">
                  <table className="board-table"><tbody>
                    {scores.slice(0, 5).map((s, i) => (
                      <tr key={s.id} className={s.id === highlightId ? "row-new" : ""}>
                        <td>{i + 1}</td><td className="text-bone">{s.name}</td>
                        <td className="text-amber-glow">{s.score.toLocaleString("fr-FR")}</td>
                        <td>{s.escaped ? "🚪" : "💀"}</td>
                      </tr>
                    ))}
                  </tbody></table>
                </div>
              )}

              <div className="flex flex-col gap-2 mt-5">
                {end.config.mode === "online" ? (
                  netSide === "host" ? (
                    <button className="start-btn !text-base !py-3" disabled={!guestJoined} onClick={startOnlineHost}>
                      {guestJoined ? "REVANCHE · R" : "ADVERSAIRE PARTI…"}
                    </button>
                  ) : (
                    <div className="text-xs text-bone/50 font-type lobby-pulse py-2">En attente d'une revanche par l'hôte…</div>
                  )
                ) : (
                  <button className="start-btn !text-base !py-3" onClick={startSolo}>REJOUER · R</button>
                )}
                <button className="ghost-btn" onClick={quitToMenu}>MENU PRINCIPAL · ESC</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

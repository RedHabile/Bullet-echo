"use client";

import { useEffect, useRef, useState } from "react";
import { drawSurvivorSprite, drawKillerSprite, hexA } from "@/game/sprites";
import {
  SURVIVOR_SKINS, KILLER_SKINS, LAMPS, questDefsFor, msToReset, fmtReset,
  claimQuest, buyItem, equipItem, lampColor, lookSurvivor, lookKiller,
  type Profile, type LocalScore, type GlobalScore,
} from "@/game/meta";
import type { Difficulty, Mode, Role } from "@/game/types";

type Section = "jouer" | "quetes" | "boutique" | "dossier";

export interface MenuProps {
  ready: boolean; muted: boolean; onToggleMute: () => void; click: () => void;
  profile: Profile; onProfile: (p: Profile) => void;
  mode: Mode; setMode: (m: Mode) => void;
  diff: Difficulty; setDiff: (d: Difficulty) => void;
  hostRole: Role; setHostRole: (r: Role) => void;
  joinCode: string; setJoinCode: (s: string) => void;
  netBusy: "idle" | "creating" | "joining"; netErr: string;
  onCreate: () => void; onJoin: () => void; onStartSolo: () => void;
  scores: LocalScore[]; highlightId: number;
  onRename: (n: string) => void;
}

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

function Wisp({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 2C9 7 6 9 6 14a6 6 0 0 0 12 0c0-5-3-7-6-12Z" fill="#ffb347" opacity="0.9" />
      <path d="M12 9c-1.6 2.6-3 3.6-3 6a3 3 0 0 0 6 0c0-2.4-1.4-3.4-3-6Z" fill="#ffe9b8" />
    </svg>
  );
}

function KeyCap({ k }: { k: string }) {
  return <span className="keycap">{k}</span>;
}

function Preview({ kind, id }: { kind: "survivor" | "killer" | "lamp"; id: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = 120 * dpr; c.height = 120 * dpr;
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const t = (now - t0) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#0a0d12";
      ctx.fillRect(0, 0, 120, 120);
      const col = kind === "lamp" ? lampColor(id) : kind === "survivor" ? "#ffb347" : lookKiller(id).eyes;
      const gr = ctx.createRadialGradient(60, 64, 4, 60, 64, 58);
      gr.addColorStop(0, hexA(col, kind === "killer" ? 0.16 : 0.22));
      gr.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, 120, 120);
      ctx.save();
      ctx.translate(60, 64);
      ctx.scale(2.4, 2.4);
      if (kind === "survivor") {
        drawSurvivorSprite(ctx, 0, 0, {
          dir: -0.55 + Math.sin(t * 0.6) * 0.12, bob: t * 3, moving: true, alive: true,
          sprinting: false, deathT: 0, look: lookSurvivor(id), lamp: "#ffe9b8",
        });
      } else if (kind === "killer") {
        drawKillerSprite(ctx, 0, 0, {
          dir: -0.55 + Math.sin(t * 0.5) * 0.1, moving: false, attackAnim: 0,
          twitch: Math.sin(t * 7) > 0.97 ? 0.1 : 0, breathT: t, look: lookKiller(id),
        });
      } else {
        ctx.rotate(-0.5);
        const cg = ctx.createLinearGradient(0, 0, 26, 0);
        cg.addColorStop(0, hexA(col, 0.85));
        cg.addColorStop(1, hexA(col, 0));
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(26, -9); ctx.lineTo(26, 9); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#565e66"; ctx.fillRect(-8, -3, 10, 6);
        ctx.fillStyle = col; ctx.fillRect(2, -2.4, 2, 4.8);
      }
      ctx.restore();
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = "#fff";
      for (let i = 0; i < 10; i++) ctx.fillRect(Math.random() * 120, Math.random() * 120, 1, 1);
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [kind, id]);
  return <canvas ref={ref} className="shop-preview" />;
}

export default function MainMenu(p: MenuProps) {
  const [section, setSection] = useState<Section>("jouer");
  const [shopTab, setShopTab] = useState<"survivor" | "killer" | "lamp">("survivor");
  const [boardTab, setBoardTab] = useState<"local" | "global">("local");
  const [globalScores, setGlobalScores] = useState<GlobalScore[] | null>(null);
  const [globalErr, setGlobalErr] = useState(false);
  const [resetMs, setResetMs] = useState(msToReset());
  const [nameDraft, setNameDraft] = useState(p.profile.name);

  useEffect(() => {
    const iv = window.setInterval(() => setResetMs(msToReset()), 1000);
    return () => window.clearInterval(iv);
  }, []);

  useEffect(() => {
    if (section !== "dossier" || boardTab !== "global") return;
    let dead = false;
    setGlobalErr(false);
    fetch("/api/scores")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad"))))
      .then((d: { scores: GlobalScore[] }) => { if (!dead) setGlobalScores(d.scores); })
      .catch(() => { if (!dead) { setGlobalErr(true); setGlobalScores(null); } });
    return () => { dead = true; };
  }, [section, boardTab]);

  const questDefs = questDefsFor(p.profile.quests.date);
  const claimable = p.profile.quests.list.filter((q) => {
    const d = questDefs.find((x) => x.id === q.id);
    return d && !q.claimed && q.progress >= d.target;
  }).length;

  const nav: { id: Section; label: string; sub: string; badge?: number }[] = [
    { id: "jouer", label: "JOUER", sub: "entrer dans l'asile" },
    { id: "quetes", label: "QUÊTES DU JOUR", sub: "contrats signés", badge: claimable },
    { id: "boutique", label: "MARCHÉ NOIR", sub: "skins & lampes" },
    { id: "dossier", label: "DOSSIER", sub: "votre âme, consignée" },
  ];

  const go = (s: Section) => { p.click(); setSection(s); };

  return (
    <div className="absolute inset-0 z-30 menu2-root">
      <div className="menu2-bg" />
      <div className="menu2-lamp" />
      <div className="menu2-grain" />

      {/* barre supérieure */}
      <header className="menu2-head">
        <div>
          <div className="text-[9px] tracking-[0.45em] text-bone/45">ASILE DE HOLLOW PINES · BUREAU D'ADMISSION · 3H07</div>
          <h1 className="menu2-title">THE HOLLOW</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="souls-chip" title="âmes récoltées">
            <Wisp size={16} />
            <b>{p.profile.souls.toLocaleString("fr-FR")}</b>
            <span>ÂMES</span>
          </div>
          <button className="icon-btn" onClick={p.onToggleMute}>{p.muted ? "🔇" : "🔊"}</button>
        </div>
      </header>

      <div className="menu2-body">
        {/* navigation */}
        <nav className="menu2-nav">
          {nav.map((n, i) => (
            <button key={n.id} className={`nav-item ${section === n.id ? "nav-active" : ""}`} onClick={() => go(n.id)}>
              <span className="nav-idx">0{i + 1}</span>
              <span className="nav-text">
                <span className="nav-label">{n.label}</span>
                <span className="nav-sub">{n.sub}</span>
              </span>
              {!!n.badge && <span className="nav-badge">{n.badge}</span>}
            </button>
          ))}
          <div className="nav-foot">
            <div className="redact" style={{ width: 84 }} />
            <div className="text-[8px] tracking-[0.3em] text-bone/30 mt-2">DOSSIER Nº 307 · NE PAS DIFFUSER</div>
            <div className="text-[8px] tracking-[0.2em] text-bone/25 mt-1">CASQUE CONSEILLÉ · LUMIÈRE ÉTEINTE</div>
          </div>
        </nav>

        {/* contenu */}
        <main className="menu2-main menu-scroll">
          {section === "jouer" && (
            <div className="paper-panel section-enter" key="jouer">
              <div className="paper-head">
                <h2 className="paper-title">FORMULAIRE D'ADMISSION</h2>
                <span className="stamp">ADMIS</span>
              </div>
              <p className="paper-sub">Cinq fusibles. Une porte. Deux ailes de l'asile. Et lui, quelque part entre les murs.</p>

              <div className="flex flex-col landscape:flex-row gap-3 mt-4">
                <button className={`folder-card ${p.mode === "solo" ? "folder-active" : ""}`} onClick={() => { p.setMode("solo"); p.click(); }}>
                  <span className="folder-tab">SOLO</span>
                  <b>SEUL DANS LE NOIR</b>
                  <em>Le boucher-robot vous entend courir et se souvient de vos cachettes. Angoisse ou Cauchemar.</em>
                </button>
                <button className={`folder-card ${p.mode === "online" ? "folder-active" : ""}`} onClick={() => { p.setMode("online"); p.click(); }}>
                  <span className="folder-tab">EN LIGNE</span>
                  <b>DEUX ÂMES, UN COULOIR</b>
                  <em>Créez une session, partagez le code. L'un chasse, l'autre survit — chacun sur son écran.</em>
                </button>
              </div>

              {p.mode === "solo" ? (
                <div className="mt-4 flex flex-col items-start gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] tracking-[0.3em] text-bone/40">NIVEAU DE PEUR</span>
                    {(["normal", "nightmare"] as Difficulty[]).map((d) => (
                      <button key={d} className={`diff-btn ${p.diff === d ? (d === "nightmare" ? "diff-nightmare" : "diff-active") : ""}`}
                        onClick={() => { p.setDiff(d); p.click(); try { localStorage.setItem("hollow.diff", d); } catch { /* noop */ } }}>
                        {d === "normal" ? "ANGOISSE" : "CAUCHEMAR ×1,5"}
                      </button>
                    ))}
                  </div>
                  <button className="start-btn" disabled={!p.ready} onClick={p.onStartSolo}>
                    {p.ready ? "ENTRER DANS L'ASILE" : "INVOCATION DES TÉNÈBRES…"}
                  </button>
                </div>
              ) : (
                <div className="mt-4 flex flex-col gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] tracking-[0.3em] text-bone/40">VOTRE RÔLE</span>
                    <button className={`diff-btn ${p.hostRole === "survivor" ? "diff-active" : ""}`} onClick={() => { p.setHostRole("survivor"); p.click(); }}>🕯️ LE SURVIVANT</button>
                    <button className={`diff-btn ${p.hostRole === "killer" ? "diff-nightmare" : ""}`} onClick={() => { p.setHostRole("killer"); p.click(); }}>🔪 LE BOUCHER</button>
                  </div>
                  <div className="flex flex-col landscape:flex-row gap-3 landscape:items-center">
                    <button className="start-btn !text-base" disabled={!p.ready || p.netBusy !== "idle"} onClick={p.onCreate}>
                      {p.netBusy === "creating" ? "OUVERTURE DU PORTAIL…" : "CRÉER UNE SESSION"}
                    </button>
                    <div className="flex gap-2">
                      <input
                        className="name-input text-center !text-lg tracking-[0.4em] !w-32" value={p.joinCode} maxLength={4}
                        placeholder="CODE"
                        onChange={(e) => p.setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                      />
                      <button className="carve-btn !px-5" disabled={p.netBusy !== "idle" || p.joinCode.length < 4} onClick={p.onJoin}>
                        {p.netBusy === "joining" ? "…" : "REJOINDRE"}
                      </button>
                    </div>
                  </div>
                  {p.netErr && <div className="text-blood-bright text-xs font-type">{p.netErr}</div>}
                </div>
              )}

              <div className="paper-divider" />
              <div className="grid grid-cols-1 landscape:grid-cols-3 gap-2">
                <div className="howto"><em>PROTOCOLE 1 · FOUILLER</em>Fusibles, taser ⚡, fusées 🔥. Suivez les lueurs. Les chaînes paient double.</div>
                <div className="howto"><em>PROTOCOLE 2 · SURVIVRE</em>Courir fait du bruit. Le taser étourdit, la fusée repousse. Les casiers cachent… sauf s'il vous a vu.</div>
                <div className="howto"><em>PROTOCOLE 3 · SORTIR</em>Alimentez la porte, fuyez. Chaque chasse rapporte des âmes pour le marché noir.</div>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-bone/55 font-type mt-3">
                <span><KeyCap k="ZQSD/WASD" /> bouger · <KeyCap k="MAJ" /> courir · <KeyCap k="E" /> cacher</span>
                <span><KeyCap k="F" /> taser · <KeyCap k="G" /> fusée</span>
                <span>boucher : <KeyCap k="ESPACE" /> frapper · <KeyCap k="Q" /> sens</span>
                <span><KeyCap k="ESC" /> pause · <KeyCap k="M" /> son · tactile : joystick + boutons</span>
              </div>
            </div>
          )}

          {section === "quetes" && (
            <div className="paper-panel section-enter" key="quetes">
              <div className="paper-head">
                <h2 className="paper-title">CONTRATS DU JOUR</h2>
                <span className="stamp">SIGNÉS</span>
              </div>
              <p className="paper-sub">
                L'asile paie ceux qui le nourrissent. Nouvelles clauses dans <b className="text-amber-glow">{fmtReset(resetMs)}</b>.
              </p>
              <div className="mt-4 flex flex-col gap-3">
                {questDefs.map((d) => {
                  const qs = p.profile.quests.list.find((q) => q.id === d.id) ?? { id: d.id, progress: 0, claimed: false };
                  const done = qs.progress >= d.target;
                  const pct = Math.min(100, (qs.progress / d.target) * 100);
                  return (
                    <div key={d.id} className={`quest-row ${qs.claimed ? "quest-paid" : ""}`}>
                      <div className="flex-1 min-w-0">
                        <div className="quest-label">{d.label}</div>
                        <div className="quest-bar"><div className="quest-fill" style={{ width: `${pct}%` }} /></div>
                        <div className="text-[9px] text-bone/45 mt-1 font-type">
                          {d.key === "time" ? `${fmtTime(Math.min(qs.progress, d.target))} / ${fmtTime(d.target)}` : `${Math.min(qs.progress, d.target)} / ${d.target}`}
                        </div>
                      </div>
                      <div className="quest-reward"><Wisp size={12} /> +{d.reward}</div>
                      {qs.claimed ? (
                        <span className="quest-stamp-paid">PAYÉ ✓</span>
                      ) : done ? (
                        <button className="quest-claim" onClick={() => { p.onProfile(claimQuest(p.profile, d.id)); p.click(); }}>RÉCLAMER</button>
                      ) : (
                        <span className="quest-wip">EN COURS</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="paper-divider" />
              <p className="text-[10px] text-bone/40 font-type">
                Les chasses solo et en ligne comptent. La prime du jour (+75 âmes) est versée à votre première visite.
                Les âmes achètent des skins au marché noir — le boucher aussi a le droit d'être élégant.
              </p>
            </div>
          )}

          {section === "boutique" && (
            <div className="paper-panel section-enter" key="boutique">
              <div className="paper-head">
                <h2 className="paper-title">MARCHÉ NOIR</h2>
                <span className="stamp">NON RÉGLEMENTÉ</span>
              </div>
              <p className="paper-sub">Ce qui a été trouvé dans les casiers se paie en âmes. Essayez avant d'acheter — les morts ne remboursent pas.</p>
              <div className="flex gap-2 mt-3 mb-4">
                {(["survivor", "killer", "lamp"] as const).map((t) => (
                  <button key={t} className={`tab-btn ${shopTab === t ? "tab-active" : ""}`} onClick={() => { setShopTab(t); p.click(); }}>
                    {t === "survivor" ? "🕯️ SURVIVANT" : t === "killer" ? "🔪 BOUCHER" : "🔦 LAMPE"}
                  </button>
                ))}
              </div>
              <div className="shop-grid">
                {(shopTab === "survivor" ? SURVIVOR_SKINS : shopTab === "killer" ? KILLER_SKINS : LAMPS).map((item) => {
                  const owned = p.profile.owned.includes(item.id);
                  const equipped = p.profile.equipped[shopTab] === item.id;
                  const affordable = p.profile.souls >= item.price;
                  return (
                    <div key={item.id} className={`shop-card ${equipped ? "shop-equipped" : ""}`}>
                      <Preview kind={shopTab} id={item.id} />
                      <div className="shop-name">{item.name}</div>
                      <div className="shop-desc">{item.desc}</div>
                      {equipped ? (
                        <span className="equipped-tag">ÉQUIPÉ ✓</span>
                      ) : owned ? (
                        <button className="shop-buy shop-equip" onClick={() => { p.onProfile(equipItem(p.profile, item.id)); p.click(); }}>ÉQUIPER</button>
                      ) : (
                        <button className="shop-buy" disabled={!affordable}
                          onClick={() => { p.onProfile(buyItem(p.profile, item.id)); p.click(); }}>
                          <Wisp size={11} /> {item.price.toLocaleString("fr-FR")} ÂMES
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="paper-divider" />
              <p className="text-[10px] text-bone/40 font-type">
                Vos skins sont visibles par votre adversaire en ligne. La teinte de lampe change votre faisceau — pas sa portée.
                Gagnez des âmes : score de chasse ÷ 10, bonus d'évasion, victoires en ligne, contrats du jour.
              </p>
            </div>
          )}

          {section === "dossier" && (
            <div className="paper-panel section-enter" key="dossier">
              <div className="paper-head">
                <h2 className="paper-title">DOSSIER DU PATIENT</h2>
                <span className="stamp">CLASSÉ</span>
              </div>
              <div className="flex gap-2 items-center mt-3 mb-4 flex-wrap">
                <span className="text-[10px] tracking-[0.3em] text-bone/40">NOM CONSIGNED</span>
                <input className="name-input !w-44" value={nameDraft} maxLength={12}
                  onChange={(e) => setNameDraft(e.target.value.toUpperCase())} />
                <button className="carve-btn" onClick={() => { p.onRename(nameDraft.trim() || "SURVIVANT"); p.click(); }}>CONSIGNER</button>
                <span className="redact" style={{ width: 60 }} />
              </div>
              <div className="stat-grid">
                <div className="stat-cell"><b>{p.profile.stats.runs}</b><span>CHASSES</span></div>
                <div className="stat-cell"><b className="text-green-ghost">{p.profile.stats.escapes}</b><span>ÉVASIONS</span></div>
                <div className="stat-cell"><b className="text-blood-bright">{p.profile.stats.caught}</b><span>CAPTURES</span></div>
                <div className="stat-cell"><b className="text-amber-glow">{p.profile.stats.best.toLocaleString("fr-FR")}</b><span>MEILLEUR SCORE</span></div>
                <div className="stat-cell"><b>{p.profile.stats.fuses}</b><span>FUSIBLES</span></div>
                <div className="stat-cell"><b>{p.profile.stats.stuns}</b><span>PARADES</span></div>
                <div className="stat-cell"><b>{p.profile.stats.close}</b><span>FRÔLEMENTS</span></div>
                <div className="stat-cell"><b>{p.profile.stats.hides}</b><span>CACHETTES</span></div>
                <div className="stat-cell"><b>{fmtTime(p.profile.stats.time)}</b><span>TEMPS SURVÉCU</span></div>
                <div className="stat-cell"><b>{p.profile.stats.onlineWins}</b><span>VICTOIRES EN LIGNE</span></div>
              </div>

              <div className="paper-divider" />
              <div className="flex gap-2 mb-2">
                <button className={`tab-btn ${boardTab === "local" ? "tab-active" : ""}`} onClick={() => setBoardTab("local")}>REGISTRE LOCAL</button>
                <button className={`tab-btn ${boardTab === "global" ? "tab-active" : ""}`} onClick={() => setBoardTab("global")}>TOUTES LES ÂMES</button>
              </div>
              {boardTab === "local" ? (
                p.scores.length === 0
                  ? <div className="board-empty">personne n'a encore survécu ici</div>
                  : <table className="board-table"><tbody>
                    {p.scores.map((s, i) => (
                      <tr key={s.id} className={s.id === p.highlightId ? "row-new" : ""}>
                        <td>{i + 1}</td><td className="text-bone">{s.name}</td>
                        <td className="text-amber-glow">{s.score.toLocaleString("fr-FR")}</td>
                        <td>{s.fuses}/5 ⚡</td><td>{fmtTime(s.timeSec)}</td>
                        <td>{s.escaped ? "🚪 sorti" : "💀 pris"}</td>
                        <td className="hidden landscape:table-cell">{s.diff === "nightmare" ? "CM" : "AN"}</td>
                      </tr>
                    ))}
                  </tbody></table>
              ) : globalErr ? (
                <div className="board-empty">l'archive est injoignable… (hors ligne)</div>
              ) : !globalScores ? (
                <div className="board-empty">à l'écoute des autres âmes…</div>
              ) : globalScores.length === 0 ? (
                <div className="board-empty">l'archive est vide. soyez le premier.</div>
              ) : (
                <table className="board-table"><tbody>
                  {globalScores.map((s, i) => (
                    <tr key={s.id}>
                      <td>{i + 1}</td><td className="text-bone">{s.name}</td>
                      <td className="text-amber-glow">{s.score.toLocaleString("fr-FR")}</td>
                      <td>{s.fuses}/5 ⚡</td><td>{fmtTime(s.timeSec)}</td>
                      <td>{s.escaped ? "🚪 sorti" : "💀 pris"}</td>
                    </tr>
                  ))}
                </tbody></table>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

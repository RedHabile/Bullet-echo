// ── THE HOLLOW · client de session en ligne (SSE + repli polling) ───────────
import type { Role } from "./types";

export type NetSide = "host" | "guest";
export interface NetMsg { type: string; [k: string]: unknown; }

interface CreateRes { code: string; token: string; role: NetSide; hostRole: Role; started: boolean; }

export class NetSession {
  code: string;
  token: string;
  side: NetSide;
  hostRole: Role;
  started: boolean;
  onMsg: (m: NetMsg) => void = () => {};
  onLost: () => void = () => {};
  onOpen: () => void = () => {};
  private es: EventSource | null = null;
  private pollTimer = 0;
  private watchdog = 0;
  private lastMsg = 0;
  private closed = false;
  private retries = 0;
  private polling = false;

  private constructor(r: CreateRes) {
    this.code = r.code;
    this.token = r.token;
    this.side = r.role;
    this.hostRole = r.hostRole;
    this.started = r.started;
  }

  static async create(hostRole: Role): Promise<NetSession> {
    const r = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", role: hostRole }),
    });
    if (!r.ok) throw new Error("create failed");
    return new NetSession((await r.json()) as CreateRes);
  }

  static async join(code: string): Promise<NetSession> {
    const r = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "join", code: code.toUpperCase().trim() }),
    });
    if (!r.ok) {
      const body = (await r.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "join failed");
    }
    return new NetSession((await r.json()) as CreateRes);
  }

  connect() {
    if (this.closed) return;
    this.lastMsg = Date.now();
    if (!this.polling) {
      try {
        this.es = new EventSource(`/api/session/${this.code}?token=${this.token}`);
        this.es.onopen = () => { this.retries = 0; this.onOpen(); };
        this.es.onmessage = (e) => {
          this.lastMsg = Date.now();
          try { this.onMsg(JSON.parse(e.data as string) as NetMsg); } catch { /* ignore */ }
        };
        this.es.onerror = () => {
          this.es?.close();
          this.es = null;
          if (this.closed) return;
          this.retries++;
          if (this.retries >= 3) this.startPolling();
          else window.setTimeout(() => this.connect(), 700 * this.retries);
        };
      } catch {
        this.startPolling();
      }
    }
    window.clearInterval(this.watchdog);
    this.watchdog = window.setInterval(() => {
      if (this.closed) return;
      if (Date.now() - this.lastMsg > 15000) {
        this.closed = true;
        this.teardown();
        this.onLost();
      }
    }, 3000);
  }

  private startPolling() {
    if (this.polling || this.closed) return;
    this.polling = true;
    this.onOpen();
    const tick = async () => {
      if (this.closed) return;
      try {
        const r = await fetch(`/api/session/${this.code}?token=${this.token}&poll=1`);
        if (r.ok) {
          const d = (await r.json()) as { msgs: NetMsg[] };
          if (d.msgs.length) this.lastMsg = Date.now();
          for (const m of d.msgs) this.onMsg(m);
        }
      } catch { /* réseau hoquet */ }
      if (!this.closed) this.pollTimer = window.setTimeout(tick, 90);
    };
    void tick();
  }

  send(type: string, data?: Record<string, unknown>) {
    if (this.closed) return;
    void fetch(`/api/session/${this.code}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: this.token, type, data: data ?? {} }),
      keepalive: true,
    }).catch(() => { /* perte tolérée */ });
  }

  private teardown() {
    this.es?.close();
    this.es = null;
    window.clearInterval(this.watchdog);
    window.clearTimeout(this.pollTimer);
  }

  close(sendBye = true) {
    if (this.closed) return;
    if (sendBye) this.send("bye");
    this.closed = true;
    this.teardown();
  }
}

import { sessions, sweep, type Session } from "@/server/sessions";

export const dynamic = "force-dynamic";

type Side = "host" | "guest";

function identify(s: Session, token: string | null): Side | null {
  if (!token) return null;
  if (token === s.hostToken) return "host";
  if (token === s.guestToken) return "guest";
  return null;
}

function deliver(s: Session, target: Side, msg: Record<string, unknown>) {
  const listener = s.listen[target];
  if (listener) {
    try { listener(msg); return; } catch { s.listen[target] = null; }
  }
  const q = s.q[target];
  if (msg.type === "state" || msg.type === "input") {
    const idx = q.findIndex((m) => m.type === msg.type);
    if (idx >= 0) { q[idx] = msg; return; }
  }
  q.push(msg);
  if (q.length > 120) q.shift();
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  sweep();
  const { code } = await params;
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const s = sessions.get(code.toUpperCase());
  if (!s) return Response.json({ error: "session introuvable" }, { status: 404 });
  const side = identify(s, token);
  if (!side) return Response.json({ error: "jeton invalide" }, { status: 403 });
  if (side === "host") s.lastHost = Date.now(); else s.lastGuest = Date.now();

  if (url.searchParams.get("poll") === "1") {
    const msgs = s.q[side].splice(0);
    return Response.json({ msgs });
  }

  const enc = new TextEncoder();
  let closed = false;
  let ping: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (m: Record<string, unknown>) => {
        if (closed) return;
        try { controller.enqueue(enc.encode(`data: ${JSON.stringify(m)}\n\n`)); }
        catch { closed = true; }
      };
      s.listen[side] = send;
      send({
        type: "hello", role: side, hostRole: s.hostRole,
        guestJoined: !!s.guestToken, started: s.started,
      });
      for (const m of s.q[side].splice(0)) send(m);
      ping = setInterval(() => {
        send({ type: "ping" });
        if (closed && ping) clearInterval(ping);
      }, 8000);
      req.signal.addEventListener("abort", () => {
        closed = true;
        if (ping) clearInterval(ping);
        if (s.listen[side] === send) s.listen[side] = null;
        try { controller.close(); } catch { /* déjà fermé */ }
      });
    },
    cancel() {
      closed = true;
      if (ping) clearInterval(ping);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const s = sessions.get(code.toUpperCase());
  if (!s) return Response.json({ error: "session introuvable" }, { status: 404 });
  let body: { token?: string; type?: string; data?: Record<string, unknown> };
  try { body = (await req.json()) as typeof body; }
  catch { return Response.json({ error: "bad json" }, { status: 400 }); }
  const side = identify(s, body.token ?? null);
  if (!side) return Response.json({ error: "jeton invalide" }, { status: 403 });
  const now = Date.now();
  if (side === "host") s.lastHost = now; else s.lastGuest = now;

  const type = String(body.type ?? "");
  if (!type) return Response.json({ error: "type manquant" }, { status: 400 });

  if (type === "start") s.started = true;
  if (type === "bye") {
    const other: Side = side === "host" ? "guest" : "host";
    deliver(s, other, { type: side === "host" ? "bye" : "guest-left" });
    if (side === "host") sessions.delete(s.code);
    else s.guestToken = null;
    return Response.json({ ok: true });
  }

  const other: Side = side === "host" ? "guest" : "host";
  deliver(s, other, { type, ...(body.data ?? {}) });
  return Response.json({ ok: true });
}

import { sessions, sweep, makeCode } from "@/server/sessions";
import type { Role } from "@/game/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  sweep();
  let body: { action?: string; role?: Role; code?: string };
  try { body = await req.json(); } catch { return Response.json({ error: "bad json" }, { status: 400 }); }
  if (body.action === "create") {
    const code = makeCode();
    const token = crypto.randomUUID();
    const hostRole: Role = body.role === "killer" ? "killer" : "survivor";
    const now = Date.now();
    sessions.set(code, { code, hostToken: token, guestToken: null, hostRole, started: false, createdAt: now, lastHost: now, lastGuest: now, q: { host: [], guest: [] }, listen: { host: null, guest: null } });
    return Response.json({ code, token, role: "host", hostRole, started: false });
  }
  if (body.action === "join") {
    const code = String(body.code ?? "").toUpperCase().trim();
    const s = sessions.get(code);
    if (!s) return Response.json({ error: "session introuvable" }, { status: 404 });
    if (s.guestToken) return Response.json({ error: "session complète" }, { status: 409 });
    const token = crypto.randomUUID();
    s.guestToken = token; s.lastGuest = Date.now();
    return Response.json({ code, token, role: "guest", hostRole: s.hostRole, started: s.started });
  }
  return Response.json({ error: "action invalide" }, { status: 400 });
}

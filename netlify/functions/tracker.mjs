// Owner-only: returns Signal Tracker history. Everyone else gets "forbidden".
// POST: the owner's browser sends 5-minute price charts for coins the server couldn't fetch.
import { getStore } from "@netlify/blobs";
import { takeSnapshot, evaluate, listSnapshots, verifyOwner, fillFromCandles } from "../lib/core.mjs";
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const hourKey = (ms) => "snap/" + new Date(ms).toISOString().slice(0, 13);

export default async (req) => {
  const user = await verifyOwner(req);
  if (!user) return json({ error: "forbidden" }, 403);
  const store = getStore("tracker");
  if (req.method === "POST") {
    let body; try { body = await req.json(); } catch (_) { return json({ error: "bad json" }, 400); }
    const now = Date.now(), byKey = new Map();
    for (const f of (body.fills || []).slice(0, 40)) {
      const key = hourKey(+f.t);
      if (!byKey.has(key)) byKey.set(key, await store.get(key, { type: "json" }).catch(() => null));
      const d = byKey.get(key); if (!d || d.t !== +f.t) continue;
      const c = d.coins.find((x) => x.id === f.id);
      const C = Array.isArray(f.C) ? f.C.map((k) => k.map(Number)).filter((k) => k.length >= 5 && k.every(Number.isFinite)).sort((a, b) => a[0] - b[0]) : [];
      if (c && c.cd === undefined && C.length && now - d.t >= 58 * 60000) fillFromCandles(c, d.t, C, now);
    }
    let saved = 0; for (const [k, d] of byKey) if (d) { await store.setJSON(k, d); saved++; }
    return json({ ok: true, saved });
  }
  try { await takeSnapshot(store); await evaluate(store, Date.now(), { budgetMs: 2500 }); } catch (e) { console.log("tracker refresh failed", String(e)); }
  const snaps = await listSnapshots(store, 14);
  return json({ snapshots: snaps, now: Date.now() });
};

// Owner-only: returns Signal Tracker history. Everyone else gets "forbidden".
import { getStore } from "@netlify/blobs";
import { takeSnapshot, evaluate, listSnapshots, verifyOwner } from "../lib/core.mjs";
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export default async (req) => {
  const user = await verifyOwner(req);
  if (!user) return json({ error: "forbidden" }, 403);
  const store = getStore("tracker");
  try { await takeSnapshot(store); await evaluate(store, Date.now(), { budgetMs: 2500 }); } catch (e) { console.log("tracker refresh failed", String(e)); }
  const snaps = await listSnapshots(store, 14);
  return json({ snapshots: snaps, now: Date.now() });
};

// Moonscope Signal Tracker: shared logic for snapshots, results and owner check.
const API = "https://api.dexscreener.com";
export const env = (k) => (globalThis.Netlify?.env?.get?.(k)) ?? process.env[k];
const getJSON = async (url, ms = 9000) => {
  const c = new AbortController(); const to = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { signal: c.signal }); if (!r.ok) throw new Error("HTTP " + r.status); return await r.json(); }
  finally { clearTimeout(to); }
};
const BLUE = [["solana","EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm"],["solana","DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"],["solana","7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr"],["solana","9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump"],["ethereum","0x6982508145454Ce325dDbE47a25d4ec3d2311933"],["base","0x532f27101965dd16442E59d40670FaF5eBB142E4"]];
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

function fromPair(p) {
  const info = p.info || {};
  return {
    id: p.chainId + ":" + p.baseToken.address.toLowerCase(), chain: p.chainId, addr: p.baseToken.address,
    name: p.baseToken.name, sym: (p.baseToken.symbol || "").replace(/^\$/, ""), dex: p.dexId,
    price: +p.priceUsd || 0, ch: Object.assign({ m5: 0, h1: 0, h6: 0, h24: 0 }, p.priceChange || {}),
    vol: Object.assign({ m5: 0, h1: 0, h6: 0, h24: 0 }, p.volume || {}),
    tx: Object.assign({ m5: { buys: 0, sells: 0 }, h1: { buys: 0, sells: 0 }, h24: { buys: 0, sells: 0 } }, p.txns || {}),
    liq: (p.liquidity && p.liquidity.usd) || 0, mc: p.marketCap || p.fdv || 0, created: p.pairCreatedAt || null,
    socials: info.socials || [], webs: info.websites || [], boost: (p.boosts && p.boosts.active) || 0,
  };
}
// Same Signal Score and safety check the website uses.
export function score(t) {
  const v1 = t.vol.h1 || 0, v24 = t.vol.h24 || 0, spike = v24 > 0 ? v1 * 24 / v24 : 0;
  const b = t.tx.h1.buys || 0, s = t.tx.h1.sells || 0, bs = b + s, b24 = t.tx.h24.buys || 0, s24 = t.tx.h24.sells || 0;
  const ratio = bs >= 10 ? b / bs : b24 / Math.max(1, b24 + s24);
  const act = (b24 + s24) > 0 ? bs * 24 / (b24 + s24) : 0, depth = t.mc > 0 ? t.liq / t.mc : 0;
  const comm = Math.min(3, t.socials.length) + (t.webs.length ? 1 : 0);
  let sc = clamp((spike - 1) / 3) * 25 + clamp((ratio - .5) / .25) * 20 + clamp((act - 1) / 2) * 15
    + clamp((t.ch.h1 || 0) / 15) * 7 + clamp((t.ch.h6 || 0) / 40) * 8 + clamp(depth / .1) * 15 + Math.min(10, comm * 2 + (t.boost ? 3 : 0));
  if ((t.ch.h24 || 0) < -80 || t.liq < 5000) sc *= .5;
  return Math.round(sc);
}
export function risk(t) {
  const h = t.created ? (Date.now() - t.created) / 36e5 : null, b = t.tx.h1.buys || 0, s = t.tx.h1.sells || 0, depth = t.mc > 0 ? t.liq / t.mc : 0, curve = t.dex === "pumpfun";
  const c = [
    curve ? { ok: false, lvl: "mid" } : { ok: t.liq >= 25000, lvl: "high" },
    { ok: (t.ch.h24 || 0) > -50, lvl: "high" },
    curve ? null : { ok: depth >= .03, lvl: "mid" },
    { ok: h == null || h >= 24, lvl: "mid" },
    { ok: !(s > 20 && s > b * 2), lvl: "mid" },
    { ok: t.socials.length > 0 || t.webs.length > 0, lvl: "low" },
  ].filter(Boolean);
  return c.some((x) => !x.ok && x.lvl === "high") ? "high" : c.some((x) => !x.ok && x.lvl === "mid") ? "med" : "low";
}

async function fetchTokens(list) {
  const by = {}; list.forEach(([c, a]) => (by[c] = by[c] || []).push(a));
  const calls = []; Object.entries(by).forEach(([c, l]) => { for (let i = 0; i < l.length; i += 30) calls.push(getJSON(API + "/tokens/v1/" + c + "/" + l.slice(i, i + 30).join(","))); });
  const out = await Promise.allSettled(calls), best = new Map();
  out.forEach((r) => { if (r.status !== "fulfilled") return; const arr = Array.isArray(r.value) ? r.value : (r.value && r.value.pairs) || [];
    arr.forEach((p) => { if (!p || !p.baseToken || !p.priceUsd) return; const t = fromPair(p); const cur = best.get(t.id); if (!cur || t.liq > cur.liq) best.set(t.id, t); }); });
  return best;
}
async function discover() {
  const res = await Promise.allSettled([getJSON(API + "/token-boosts/top/v1"), getJSON(API + "/token-boosts/latest/v1"), getJSON(API + "/token-profiles/latest/v1"), getJSON(API + "/community-takeovers/latest/v1"), getJSON(API + "/latest/dex/search?q=pump")]);
  const want = new Map(); BLUE.forEach(([c, a]) => want.set(c + ":" + a.toLowerCase(), [c, a]));
  res.slice(0, 4).forEach((r) => { if (r.status !== "fulfilled" || !Array.isArray(r.value)) return; r.value.slice(0, 80).forEach((x) => { if (x.chainId && x.tokenAddress) want.set(x.chainId + ":" + x.tokenAddress.toLowerCase(), [x.chainId, x.tokenAddress]); }); });
  const sr = res[4]; if (sr.status === "fulfilled") (sr.value.pairs || []).forEach((p) => { if (p.chainId === "solana" && p.baseToken && (p.dexId === "pumpfun" || p.dexId === "pumpswap")) want.set("solana:" + p.baseToken.address.toLowerCase(), ["solana", p.baseToken.address]); });
  return [...want.values()];
}

const hourKey = (ms) => "snap/" + new Date(ms).toISOString().slice(0, 13); // e.g. snap/2026-10-07T05

// Save this hour's top 10 Hot coins (same rule as the site: highest score with $10K+ liquidity).
export async function takeSnapshot(store, now = Date.now()) {
  const key = hourKey(now);
  if (await store.get(key, { type: "json" })) return { key, skipped: true };
  const toks = await fetchTokens(await discover());
  const hot = [...toks.values()].filter((t) => t.liq >= 10000).map((t) => ({ t, s: score(t) }))
    .sort((a, b) => b.s - a.s).slice(0, 10)
    .map(({ t, s }) => ({ id: t.id, chain: t.chain, addr: t.addr, sym: t.sym, name: t.name, price: t.price, score: s, risk: risk(t), liq: Math.round(t.liq), mc: Math.round(t.mc) }));
  if (!hot.length) return { key, empty: true };
  await store.setJSON(key, { t: now, coins: hot });
  return { key, saved: hot.length };
}

// Fill in prices 1h, 6h and 24h after each snapshot.
const HZ = [["r1", 36e5], ["r6", 6 * 36e5], ["r24", 24 * 36e5]];
export async function evaluate(store, now = Date.now()) {
  const snaps = [];
  const keys = Array.from({ length: 30 }, (_, i) => hourKey(now - (i + 1) * 36e5));
  const got = await Promise.all(keys.map((k) => store.get(k, { type: "json" }).catch(() => null)));
  got.forEach((d, i) => { if (d && d.coins) snaps.push({ key: keys[i], d }); });
  const need = new Map();
  snaps.forEach(({ d }) => HZ.forEach(([f, ms]) => { if (now - d.t >= ms) d.coins.forEach((c) => { if (c[f] === undefined) need.set(c.id, [c.chain, c.addr]); }); }));
  if (!need.size) return { updated: 0 };
  const prices = await fetchTokens([...need.values()]);
  let updated = 0;
  for (const { key, d } of snaps) {
    let changed = false;
    HZ.forEach(([f, ms]) => { if (now - d.t >= ms) d.coins.forEach((c) => { if (c[f] === undefined) { const t = prices.get(c.id); c[f] = t ? t.price : -1; changed = true; } }); });
    if (changed) { await store.setJSON(key, d); updated++; }
  }
  return { updated };
}

export async function listSnapshots(store, days = 14) {
  const now = Date.now();
  const all = await Promise.all(Array.from({ length: days * 24 }, (_, h) => store.get(hourKey(now - h * 36e5), { type: "json" }).catch(() => null)));
  return all.filter((d) => d && d.coins);
}

// Only the site owner (or Whop team admins) may see the tracker.
export async function verifyOwner(req) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const who = await fetch("https://api.whop.com/oauth/userinfo", { headers: { Authorization: `Bearer ${token}` } });
  if (!who.ok) return null;
  const user = await who.json();
  const names = (env("OWNER_USERNAMES") || "hildcolin").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (names.includes(String(user.preferred_username || "").toLowerCase())) return user;
  const apiKey = env("WHOP_API_KEY");
  if (!apiKey) return null;
  const r = await fetch(`https://api.whop.com/api/v1/users/${encodeURIComponent(user.sub)}/access/${encodeURIComponent(env("WHOP_BUSINESS_ID") || "biz_SbLaec3slpkyMu")}`, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!r.ok) return null;
  const j = await r.json();
  return j.access_level === "admin" ? user : null;
}

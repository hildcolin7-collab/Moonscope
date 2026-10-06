// Moonscope: checks which plan a signed-in Whop user has.
// Needs one environment variable in Netlify (Project configuration > Environment variables):
//   WHOP_API_KEY            your Whop API key (keep it secret, never put it in index.html)
// Product IDs are built in below (Pro: prod_ZaXr7QRtxyhIh, Whale: prod_bvzKsoOr94D5x).
const env = (k) => (globalThis.Netlify?.env?.get?.(k)) ?? process.env[k];
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export default async (req) => {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ plan: "free", error: "not_signed_in" }, 401);

  // 1. Ask Whop who this token belongs to (can't be faked by the browser).
  const who = await fetch("https://api.whop.com/oauth/userinfo", { headers: { Authorization: `Bearer ${token}` } });
  if (!who.ok) return json({ plan: "free", error: "bad_token" }, 401);
  const user = await who.json();

  // 2. Check that user's access to each product with your secret API key.
  const apiKey = env("WHOP_API_KEY");
  if (!apiKey) return json({ plan: "free", error: "missing_api_key" }, 500);
  const debug = [];
  const check = async (resourceId) => {
    const r = await fetch(`https://api.whop.com/api/v1/users/${encodeURIComponent(user.sub)}/access/${encodeURIComponent(resourceId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } });
    let body = null; try { body = await r.json(); } catch (_) {}
    debug.push({ id: resourceId, status: r.status, level: body?.access_level ?? null, error: r.ok ? null : JSON.stringify(body)?.slice(0, 160) });
    if (!r.ok) return { has_access: false, access_level: "no_access" };
    return body || {};
  };
  const [biz, whale, pro] = await Promise.all([
    check(env("WHOP_BUSINESS_ID") || "biz_SbLaec3slpkyMu"),
    check(env("WHOP_WHALE_PRODUCT_ID") || "prod_bvzKsoOr94D5x"),
    check(env("WHOP_PRO_PRODUCT_ID") || "prod_ZaXr7QRtxyhIh"),
  ]);

  // You (the owner) and anyone on your Whop team get Whale automatically.
  const owners = (env("OWNER_USER_IDS") || "").split(",").map((x) => x.trim()).filter(Boolean);
  const ownerNames = (env("OWNER_USERNAMES") || "hildcolin").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  const isTeam = owners.includes(user.sub) || ownerNames.includes(String(user.preferred_username || "").toLowerCase()) || biz.access_level === "admin" || whale.access_level === "admin" || pro.access_level === "admin";
  const plan = isTeam || whale.has_access === true ? "whale" : pro.has_access === true ? "pro" : "free";
  return json({ plan, team: isTeam, user: user.sub, name: user.preferred_username || user.name || "", debug });
};

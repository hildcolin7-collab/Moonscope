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
  const has = async (productId) => {
    if (!productId) return false;
    const r = await fetch(`https://api.whop.com/api/v1/users/${encodeURIComponent(user.sub)}/access/${encodeURIComponent(productId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!r.ok) return false;
    const j = await r.json();
    return j.has_access === true;
  };
  const [whale, pro] = await Promise.all([has(env("WHOP_WHALE_PRODUCT_ID") || "prod_bvzKsoOr94D5x"), has(env("WHOP_PRO_PRODUCT_ID") || "prod_ZaXr7QRtxyhIh")]);

  return json({ plan: whale ? "whale" : pro ? "pro" : "free", name: user.preferred_username || user.name || "" });
};

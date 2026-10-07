// Runs every hour: saves the top 10 Hot coins and fills in earlier results.
import { getStore } from "@netlify/blobs";
import { takeSnapshot, evaluate } from "../lib/core.mjs";

export default async () => {
  const store = getStore("tracker");
  let snap = null;
  try { snap = await takeSnapshot(store); } catch (e) { snap = { error: String(e) }; }
  const ev = await evaluate(store, Date.now(), { budgetMs: 14000 });
  console.log("tracker", JSON.stringify({ snap, ev }));
  return new Response("ok");
};
export const config = { schedule: "@hourly" };

// Runs every hour: saves the top 10 Hot coins and fills in earlier results.
import { getStore } from "@netlify/blobs";
import { takeSnapshot, evaluate } from "../lib/core.mjs";

export default async () => {
  const store = getStore("tracker");
  const snap = await takeSnapshot(store);
  const ev = await evaluate(store);
  console.log("tracker", JSON.stringify({ snap, ev }));
  return new Response("ok");
};
export const config = { schedule: "@hourly" };

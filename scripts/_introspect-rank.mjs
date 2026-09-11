import { AuthManager } from "../packages/wcl-client/dist/index.js";
const auth = new AuthManager();
const token = await auth.getAccessToken();
const res = await fetch("https://cn.warcraftlogs.com/api/v2/client", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify({ query: `{ worldData { encounter(id: 61762) { name characterRankings(metric: dps, className: "Mage", specName: "Arcane", page: 1) } } }` }),
});
const json = await res.json();
const ranks = json.data?.worldData?.encounter?.characterRankings;
console.log("TOP KEYS:", Object.keys(ranks ?? {}).join(", "));
const s = JSON.stringify(ranks, null, 2);
console.log(s.slice(0, 3500));

/**
 * Run from your local machine (non-datacenter IP, bypasses LG Cloudflare block):
 *   npx tsx scripts/backfill-lp.ts
 *   npx tsx scripts/backfill-lp.ts --only "sbaa#7510"
 */

import { readFileSync } from "fs";

// Load .env.local
try {
  const raw = readFileSync(".env.local", "utf-8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !process.env[key]) process.env[key] = val;
  }
} catch {
  console.warn("Could not load .env.local — using existing env vars");
}

const RIOT_KEY = process.env.RIOT_API_KEY!;
const KV_URL = process.env.KV_REST_API_URL!;
const KV_TOKEN = process.env.KV_REST_API_TOKEN!;

if (!RIOT_KEY) throw new Error("Missing RIOT_API_KEY");
if (!KV_URL) throw new Error("Missing KV_REST_API_URL");
if (!KV_TOKEN) throw new Error("Missing KV_REST_API_TOKEN");

const KV_LP_PREFIX = "leaderboard:lp-snapshots";
const LP_SNAPSHOT_MAX = 5000;
const MIN_TIMESTAMP = 1673395200000;

const FRIENDS = [
  { gameName: "sbaa", tagLine: "7510" },
  { gameName: "Onore", tagLine: "LAS" },
  { gameName: "Grandpa Corki", tagLine: "LAS" },
  { gameName: "LKS", tagLine: "AKD" },
  { gameName: "Любовь", tagLine: "8652" },
  { gameName: "ChoiWee", tagLine: "LAS" },
  { gameName: "Growtik", tagLine: "ADO" },
  { gameName: "EmiIiano", tagLine: "LAS" },
  { gameName: "juanceto912", tagLine: "0411" },
];

// --- KV helpers (Upstash Redis HTTP API) ---

async function kvGet(key: string): Promise<{ t: number; s: number }[] | null> {
  const res = await fetch(KV_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(["GET", key]),
  });
  const json = (await res.json()) as { result: string | null };
  if (!json.result) return null;
  try {
    return JSON.parse(json.result);
  } catch {
    return null;
  }
}

async function kvSet(key: string, value: { t: number; s: number }[]): Promise<void> {
  await fetch(KV_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(["SET", key, JSON.stringify(value)]),
  });
}

// --- Riot API ---

async function getPuuid(gameName: string, tagLine: string): Promise<string | null> {
  const url = `https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  const res = await fetch(url, { headers: { "X-Riot-Token": RIOT_KEY } });
  if (!res.ok) {
    console.error(`  Riot API ${res.status} for ${gameName}#${tagLine}`);
    return null;
  }
  const data = (await res.json()) as { puuid: string };
  return data.puuid;
}

// --- LeagueOfGraphs scraper ---

function buildLgUrl(gameName: string, tagLine: string): string {
  const slug = `${gameName.toLowerCase().replace(/\s+/g, "-")}-${tagLine.toLowerCase()}`;
  return `https://www.leagueofgraphs.com/es/summoner/las/${slug}`;
}

function lgCodeToScore(code: number, lp: number): number {
  if (code >= 28) return Math.round(code * 100);
  return Math.floor(code) * 100 + Math.min(Math.max(lp, 0), 100);
}

async function fetchLgSnapshots(
  gameName: string,
  tagLine: string
): Promise<{ timestamp: number; score: number }[]> {
  const url = buildLgUrl(gameName, tagLine);
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "none",
      "sec-fetch-user": "?1",
      "upgrade-insecure-requests": "1",
    },
  });

  if (!res.ok) {
    console.error(`  LG ${res.status} for ${url}`);
    return [];
  }

  const html = await res.text();
  const graphMatch = html.match(/const graphData = (\[[\s\S]*?\]);/);
  const lpMatch = html.match(/const lpData = (\{[\s\S]*?\});/);
  if (!graphMatch) {
    console.error(`  LG: graphData not found in HTML for ${gameName}#${tagLine}`);
    return [];
  }

  let graphData: [number, number | null][];
  let lpData: Record<string, number> = {};
  try {
    graphData = JSON.parse(graphMatch[1]);
    if (lpMatch) lpData = JSON.parse(lpMatch[1]);
  } catch {
    console.error(`  LG: JSON parse failed for ${gameName}#${tagLine}`);
    return [];
  }

  const snapshots: { timestamp: number; score: number }[] = [];
  for (let i = 0; i < graphData.length - 1; i++) {
    const [t1, v1] = graphData[i];
    const [t2, v2] = graphData[i + 1];
    if (t2 !== t1 + 1 || v1 === null || v2 === null) continue;
    if (t2 < MIN_TIMESTAMP) continue;
    const lp = lpData[t2.toString()] ?? 0;
    snapshots.push({ timestamp: t2, score: lgCodeToScore(v2, lp) });
  }

  return snapshots;
}

// --- Main ---

async function main() {
  const onlyArg = process.argv.find((a) => a.startsWith("--only="))?.slice(7)
    ?? (process.argv.indexOf("--only") !== -1 ? process.argv[process.argv.indexOf("--only") + 1] : null);

  const targets = onlyArg
    ? FRIENDS.filter((f) => `${f.gameName}#${f.tagLine}` === onlyArg)
    : FRIENDS;

  if (targets.length === 0) {
    console.error(`No matching player for "${onlyArg}"`);
    process.exit(1);
  }

  for (const { gameName, tagLine } of targets) {
    const riotId = `${gameName}#${tagLine}`;
    console.log(`\n→ ${riotId}`);

    const [puuid, lgSnapshots] = await Promise.all([
      getPuuid(gameName, tagLine),
      fetchLgSnapshots(gameName, tagLine),
    ]);

    if (!puuid) {
      console.log(`  SKIP: PUUID not found`);
      continue;
    }

    if (lgSnapshots.length === 0) {
      console.log(`  SKIP: no LG snapshots`);
      continue;
    }

    console.log(`  LG snapshots fetched: ${lgSnapshots.length}`);

    const key = `${KV_LP_PREFIX}:${puuid}`;
    const existing = (await kvGet(key)) ?? [];
    const existingTs = new Set(existing.map((e) => e.t));

    let inserted = 0;
    for (const snap of lgSnapshots) {
      if (!existingTs.has(snap.timestamp)) {
        existing.push({ t: snap.timestamp, s: snap.score });
        inserted++;
      }
    }

    existing.sort((a, b) => a.t - b.t);
    if (existing.length > LP_SNAPSHOT_MAX) {
      existing.splice(0, existing.length - LP_SNAPSHOT_MAX);
    }

    await kvSet(key, existing);
    console.log(`  ✓ inserted ${inserted} new snapshots (total: ${existing.length})`);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

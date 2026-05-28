import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { FRIENDS } from "@/config/friends";
import { FriendConfig } from "@/lib/types";

const RIOT_KEY = process.env.RIOT_API_KEY!;
const KV_LP_PREFIX = "leaderboard:lp-snapshots";
const LP_SNAPSHOT_MAX = 5000;
// Pre-Emerald tier codes don't map cleanly to our toDisplayLp — only use Season 2023+
const MIN_TIMESTAMP = 1673395200000;

// leagueofgraphs embeds tierCode = toDisplayLp_base / 100
// For non-Master tiers the code is an integer; LP comes from lpData.
// For Master+ the decimal already encodes LP: 28.75 = Master 75 LP = score 2875.
function lgCodeToScore(code: number, lp: number): number {
  if (code >= 28) return Math.round(code * 100);
  return Math.floor(code) * 100 + Math.min(Math.max(lp, 0), 100);
}

function buildLgUrl(gameName: string, tagLine: string): string {
  const slug = `${gameName.toLowerCase().replace(/\s+/g, "-")}-${tagLine.toLowerCase()}`;
  return `https://www.leagueofgraphs.com/es/summoner/las/${slug}`;
}

async function getPuuid(gameName: string, tagLine: string): Promise<string | null> {
  const url = `https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  const res = await fetch(url, { headers: { "X-Riot-Token": RIOT_KEY } });
  if (!res.ok) return null;
  const data = await res.json();
  return data.puuid ?? null;
}

async function fetchLgSnapshots(
  friend: FriendConfig
): Promise<{ timestamp: number; score: number }[]> {
  const url = buildLgUrl(friend.gameName, friend.tagLine);
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    },
  });
  if (!res.ok) {
    console.error(`[LG] ${url} → ${res.status}`);
    return [];
  }
  const html = await res.text();

  const graphMatch = html.match(/const graphData = (\[[\s\S]*?\]);/);
  const lpMatch = html.match(/const lpData = (\{[\s\S]*?\});/);
  if (!graphMatch) return [];

  let graphData: [number, number | null][];
  let lpData: Record<string, number> = {};
  try {
    graphData = JSON.parse(graphMatch[1]);
    if (lpMatch) lpData = JSON.parse(lpMatch[1]);
  } catch {
    return [];
  }

  const snapshots: { timestamp: number; score: number }[] = [];

  for (let i = 0; i < graphData.length - 1; i++) {
    const [t1, v1] = graphData[i];
    const [t2, v2] = graphData[i + 1];

    // Each game generates a pair [T, before] + [T+1, after]; skip non-pairs and nulls
    if (t2 !== t1 + 1 || v1 === null || v2 === null) continue;
    if (t2 < MIN_TIMESTAMP) continue;

    const lp = lpData[t2.toString()] ?? 0;
    snapshots.push({ timestamp: t2, score: lgCodeToScore(v2, lp) });
  }

  return snapshots;
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const only = req.nextUrl.searchParams.get("only"); // optional: only backfill one player
  const targets = only
    ? FRIENDS.filter((f) => `${f.gameName}#${f.tagLine}` === only)
    : FRIENDS;

  const results: Record<string, { inserted: number; total: number; error?: string }> = {};

  for (const friend of targets) {
    const riotId = `${friend.gameName}#${friend.tagLine}`;
    try {
      const [puuid, lgSnapshots] = await Promise.all([
        getPuuid(friend.gameName, friend.tagLine),
        fetchLgSnapshots(friend),
      ]);

      if (!puuid) {
        results[riotId] = { inserted: 0, total: 0, error: "PUUID not found" };
        continue;
      }

      if (lgSnapshots.length === 0) {
        results[riotId] = { inserted: 0, total: 0, error: `No snapshots from leagueofgraphs — check server logs for HTTP status` };
        continue;
      }

      const key = `${KV_LP_PREFIX}:${puuid}`;
      const existing = (await kv.get<{ t: number; s: number }[]>(key)) ?? [];
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

      await kv.set(key, existing);
      results[riotId] = { inserted, total: existing.length };
    } catch (err) {
      results[riotId] = {
        inserted: 0,
        total: 0,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  return NextResponse.json({ results });
}

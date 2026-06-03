import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { FRIENDS } from "@/config/friends";

const KV_WEEKLY_BASELINE = "leaderboard:weekly-baseline";
const RIOT_KEY = process.env.RIOT_API_KEY!;
const hdrs = { "X-Riot-Token": RIOT_KEY };

async function riotFetch(url: string) {
  for (let i = 0; i < 3; i++) {
    const res = await fetch(url, { headers: hdrs });
    if (res.status !== 429) return res;
    const wait = parseInt(res.headers.get("Retry-After") ?? "2", 10);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
  return fetch(url, { headers: hdrs });
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Last Monday at midnight ART (UTC-3 = 03:00 UTC)
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const lastMonday = new Date(now);
  lastMonday.setUTCHours(3, 0, 0, 0);
  lastMonday.setUTCDate(lastMonday.getUTCDate() - daysToLastMonday);
  const lastMondayTs = lastMonday.getTime();

  // Fetch only puuid + ranked info for each player in parallel
  const playerData = await Promise.all(
    FRIENDS.map(async (f) => {
      try {
        const riotId = `${f.gameName}#${f.tagLine}`;
        const accountRes = await riotFetch(
          `https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(f.gameName)}/${encodeURIComponent(f.tagLine)}`
        );
        if (!accountRes.ok) return { riotId, error: `account ${accountRes.status}` };
        const { puuid } = await accountRes.json();

        const rankedRes = await riotFetch(
          `https://la2.api.riotgames.com/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`
        );
        if (!rankedRes.ok) return { riotId, puuid, error: `ranked ${rankedRes.status}` };
        const entries: { queueType: string; wins: number; losses: number }[] = await rankedRes.json();
        const solo = entries.find((e) => e.queueType === "RANKED_SOLO_5x5");

        return { riotId, puuid, wins: solo?.wins ?? 0, losses: solo?.losses ?? 0 };
      } catch (e) {
        return { riotId: `${f.gameName}#${f.tagLine}`, error: String(e) };
      }
    })
  );

  // Load all LP snapshots in parallel
  const snapshotsMap = await Promise.all(
    playerData.map(async (p) => {
      if (!p.puuid) return { riotId: p.riotId, closest: null, diff: Infinity };
      const snaps = (await kv.get<{ t: number; s: number }[]>(`leaderboard:lp-snapshots:${p.puuid}`)) ?? [];
      let closest: { t: number; s: number } | null = null;
      let closestDiff = Infinity;
      for (const snap of snaps) {
        const diff = Math.abs(snap.t - lastMondayTs);
        if (diff < closestDiff) { closestDiff = diff; closest = snap; }
      }
      return { riotId: p.riotId, closest, diff: closestDiff };
    })
  );

  const baseline: Record<string, { score: number; wins: number; losses: number; t: number }> = {};
  const results: string[] = [];

  for (let i = 0; i < playerData.length; i++) {
    const p = playerData[i];
    const { closest, diff } = snapshotsMap[i];

    if ("error" in p && p.error) {
      results.push(`${p.riotId}: error - ${p.error}`);
      continue;
    }
    if (!closest) {
      results.push(`${p.riotId}: sin snapshots`);
      continue;
    }

    baseline[p.riotId] = {
      score: closest.s,
      wins: p.wins ?? 0,
      losses: p.losses ?? 0,
      t: lastMondayTs,
    };
    results.push(`${p.riotId}: score=${closest.s} (diff=${Math.round(diff / 60000)}min desde el lunes)`);
  }

  await kv.set(KV_WEEKLY_BASELINE, baseline);
  return NextResponse.json({
    message: "Baseline backfilled",
    lastMonday: lastMonday.toISOString(),
    results,
  });
}

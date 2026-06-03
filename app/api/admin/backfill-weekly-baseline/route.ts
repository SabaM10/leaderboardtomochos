import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { fetchAllPlayers } from "@/lib/riot";
import { FRIENDS } from "@/config/friends";

const KV_WEEKLY_BASELINE = "leaderboard:weekly-baseline";
const RIOT_KEY = process.env.RIOT_API_KEY!;

async function riotFetch(url: string): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { "X-Riot-Token": RIOT_KEY } });
    if (res.status !== 429) return res;
    const wait = parseInt(res.headers.get("Retry-After") ?? "2", 10);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
  return fetch(url, { headers: { "X-Riot-Token": RIOT_KEY } });
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Last Monday at midnight ART (UTC-3 = 03:00 UTC)
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const lastMonday = new Date(now);
  lastMonday.setUTCHours(3, 0, 0, 0);
  lastMonday.setUTCDate(lastMonday.getUTCDate() - daysToLastMonday);
  const lastMondayTs = lastMonday.getTime();

  const players = await fetchAllPlayers(FRIENDS);
  const baseline: Record<string, { score: number; wins: number; losses: number; t: number }> = {};
  const results: string[] = [];

  for (const p of players) {
    if (!p.puuid || !p.ranked) {
      results.push(`${p.riotId}: sin ranked o puuid`);
      continue;
    }

    // Find snapshot closest to last Monday
    const snapshots = (await kv.get<{ t: number; s: number }[]>(`leaderboard:lp-snapshots:${p.puuid}`)) ?? [];
    let closest: { t: number; s: number } | null = null;
    let closestDiff = Infinity;
    for (const snap of snapshots) {
      const diff = Math.abs(snap.t - lastMondayTs);
      if (diff < closestDiff) { closestDiff = diff; closest = snap; }
    }

    if (!closest) {
      results.push(`${p.riotId}: sin snapshots`);
      continue;
    }

    // Count ranked games played since last Monday via match history
    let winsThisWeek = 0;
    let lossesThisWeek = 0;
    const idsRes = await riotFetch(
      `https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(p.puuid)}/ids?queue=420&count=100`
    );
    if (idsRes.ok) {
      const matchIds: string[] = await idsRes.json();
      for (const matchId of matchIds) {
        const res = await riotFetch(`https://americas.api.riotgames.com/lol/match/v5/matches/${matchId}`);
        if (!res.ok) continue;
        const data = await res.json();
        const endTime = data.info.gameCreation + data.info.gameDuration * 1000;
        if (endTime < lastMondayTs) break; // API returns newest-first, safe to stop here
        if (data.info.gameEndReason === "Abort_Remake") continue;
        const participant = data.info.participants.find((x: { puuid: string }) => x.puuid === p.puuid);
        if (!participant) continue;
        if (participant.win) winsThisWeek++; else lossesThisWeek++;
      }
    }

    baseline[p.riotId] = {
      score: closest.s,
      wins: p.ranked.wins - winsThisWeek,
      losses: p.ranked.losses - lossesThisWeek,
      t: lastMondayTs,
    };

    results.push(
      `${p.riotId}: score=${closest.s} (${new Date(closest.t).toISOString()}, diff=${Math.round(closestDiff / 60000)}min), partidas esta semana=${winsThisWeek + lossesThisWeek}`
    );
  }

  await kv.set(KV_WEEKLY_BASELINE, baseline);
  return NextResponse.json({ message: "Baseline backfilled desde snapshots", lastMonday: lastMonday.toISOString(), results });
}

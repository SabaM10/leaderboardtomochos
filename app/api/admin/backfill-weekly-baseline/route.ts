import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { fetchAllPlayers } from "@/lib/riot";
import { FRIENDS } from "@/config/friends";

const KV_WEEKLY_BASELINE = "leaderboard:weekly-baseline";

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

  // Load all snapshots in parallel
  const snapshotEntries = await Promise.all(
    players
      .filter((p) => p.puuid && p.ranked)
      .map(async (p) => {
        const snaps = (await kv.get<{ t: number; s: number }[]>(`leaderboard:lp-snapshots:${p.puuid}`)) ?? [];
        let closest: { t: number; s: number } | null = null;
        let closestDiff = Infinity;
        for (const snap of snaps) {
          const diff = Math.abs(snap.t - lastMondayTs);
          if (diff < closestDiff) { closestDiff = diff; closest = snap; }
        }
        return { player: p, closest, closestDiff };
      })
  );

  const baseline: Record<string, { score: number; wins: number; losses: number; t: number }> = {};
  const results: string[] = [];

  for (const { player: p, closest, closestDiff } of snapshotEntries) {
    if (!closest) {
      results.push(`${p.riotId}: sin snapshots`);
      continue;
    }
    // Use current wins/losses as baseline — first recap will show LP delta correctly
    // but "partidas jugadas" aparecerá como 0. Desde el segundo lunes será preciso.
    baseline[p.riotId] = {
      score: closest.s,
      wins: p.ranked!.wins,
      losses: p.ranked!.losses,
      t: lastMondayTs,
    };
    results.push(
      `${p.riotId}: score=${closest.s} (diff=${Math.round(closestDiff / 60000)}min desde el lunes)`
    );
  }

  for (const p of players) {
    if (!p.puuid || !p.ranked) results.push(`${p.riotId}: sin ranked o puuid`);
  }

  await kv.set(KV_WEEKLY_BASELINE, baseline);
  return NextResponse.json({
    message: "Baseline backfilled desde snapshots (wins/losses = actuales, partidas semana = 0 en primer recap)",
    lastMonday: lastMonday.toISOString(),
    results,
  });
}

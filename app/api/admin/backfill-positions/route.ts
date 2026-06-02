import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { fetchAllPlayers } from "@/lib/riot";
import { FRIENDS } from "@/config/friends";

const BUCKET_MS = 10 * 60 * 1000; // 10-minute buckets
const POS_HISTORY_MAX = 2016;

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Get puuids for all players
  const players = await fetchAllPlayers(FRIENDS);
  const ranked = players.filter((p) => p.puuid);

  // Read LP snapshots for every player
  const snapsByPlayer: { riotId: string; snapshots: { t: number; s: number }[] }[] = [];
  for (const p of ranked) {
    const snaps = await kv.get<{ t: number; s: number }[]>(`leaderboard:lp-snapshots:${p.puuid}`);
    if (snaps && snaps.length > 0) {
      snapsByPlayer.push({ riotId: p.riotId, snapshots: snaps });
    }
  }

  if (snapsByPlayer.length === 0) {
    return NextResponse.json({ message: "No hay LP snapshots todavía" });
  }

  // Collect all unique bucket timestamps
  const bucketSet = new Set<number>();
  for (const { snapshots } of snapsByPlayer) {
    for (const s of snapshots) {
      bucketSet.add(Math.round(s.t / BUCKET_MS) * BUCKET_MS);
    }
  }
  const buckets = [...bucketSet].sort((a, b) => a - b);

  // For each bucket, find each player's closest snapshot (within ±15 min)
  // then rank by score descending
  const posHistory: Record<string, { t: number; pos: number }[]> = {};

  for (const bucket of buckets) {
    const scores: { riotId: string; score: number }[] = [];

    for (const { riotId, snapshots } of snapsByPlayer) {
      // Find snapshot closest to this bucket
      let closest: { t: number; s: number } | null = null;
      let minDiff = Infinity;
      for (const snap of snapshots) {
        const diff = Math.abs(snap.t - bucket);
        if (diff < minDiff && diff < BUCKET_MS * 1.5) {
          minDiff = diff;
          closest = snap;
        }
      }
      if (closest) scores.push({ riotId, score: closest.s });
    }

    if (scores.length === 0) continue;

    // Sort by score descending = position
    scores.sort((a, b) => b.score - a.score);
    scores.forEach(({ riotId }, idx) => {
      if (!posHistory[riotId]) posHistory[riotId] = [];
      posHistory[riotId].push({ t: bucket, pos: idx });
    });
  }

  // Trim to max entries per player
  for (const riotId of Object.keys(posHistory)) {
    if (posHistory[riotId].length > POS_HISTORY_MAX) {
      posHistory[riotId] = posHistory[riotId].slice(-POS_HISTORY_MAX);
    }
  }

  await kv.set("leaderboard:position-history", posHistory);

  const totalEntries = Object.values(posHistory).reduce((acc, arr) => acc + arr.length, 0);
  return NextResponse.json({
    message: "Backfill completado",
    players: Object.keys(posHistory).length,
    buckets: buckets.length,
    totalEntries,
  });
}

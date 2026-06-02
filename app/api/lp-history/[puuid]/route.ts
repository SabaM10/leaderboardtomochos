import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { LpSnapshot, Tier, TierCutoffs } from "@/lib/types";
import { toDisplayLp } from "@/lib/lp";

const KV_CUTOFFS_KEY = "leaderboard:tier-cutoffs";
const RIOT_KEY = process.env.RIOT_API_KEY!;
const hdrs = { "X-Riot-Token": RIOT_KEY };

async function riotFetch(url: string): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: hdrs, next: { revalidate: 3600 } });
    if (res.status !== 429) return res;
    const wait = parseInt(res.headers.get("Retry-After") ?? "2", 10);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
  return fetch(url, { headers: hdrs, next: { revalidate: 3600 } });
}

function downsampleToHourly(snapshots: LpSnapshot[]): LpSnapshot[] {
  const HOUR_MS = 60 * 60 * 1000;
  const hourMap = new Map<number, LpSnapshot>();
  for (const snap of snapshots) {
    hourMap.set(Math.floor(snap.timestamp / HOUR_MS), snap);
  }
  return [...hourMap.values()].sort((a, b) => a.timestamp - b.timestamp);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ puuid: string }> }
) {
  const { puuid } = await params;
  const tier = (req.nextUrl.searchParams.get("tier") ?? "UNRANKED") as Tier;
  const rank = req.nextUrl.searchParams.get("rank") as string | null;
  const lp = parseInt(req.nextUrl.searchParams.get("lp") ?? "0");

  if (tier === "UNRANKED") return NextResponse.json({ snapshots: [], cutoffs: null });

  const cutoffs = (await kv.get<TierCutoffs>(KV_CUTOFFS_KEY)) ?? undefined;

  // Load real LP snapshots from KV (accurate, collected every 10 min by cron)
  const kvRaw = (await kv.get<{ t: number; s: number }[]>(`leaderboard:lp-snapshots:${puuid}`)) ?? [];
  const realSnapshots: LpSnapshot[] = kvRaw.map(({ t, s }) => ({
    timestamp: t,
    score: s,
    approximate: false,
  }));

  // Fetch match history to fill gaps before the first real snapshot
  const idsRes = await riotFetch(
    `https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?queue=420&count=25`
  );
  if (!idsRes.ok) return NextResponse.json({ snapshots: downsampleToHourly(realSnapshots), cutoffs: cutoffs ?? null });
  const matchIds: string[] = await idsRes.json();

  const matchData: { timestamp: number; win: boolean }[] = [];
  for (const matchId of matchIds) {
    const res = await riotFetch(`https://americas.api.riotgames.com/lol/match/v5/matches/${matchId}`);
    if (!res.ok) continue;
    const data = await res.json();
    const p = data.info.participants.find((x: { puuid: string }) => x.puuid === puuid);
    if (!p) continue;
    matchData.push({
      timestamp: data.info.gameCreation + data.info.gameDuration * 1000,
      win: p.win as boolean,
    });
  }

  const snapshots: LpSnapshot[] = [];

  if (realSnapshots.length > 0) {
    // Estimate backwards only for matches before our first real snapshot
    const oldestReal = realSnapshots[0];
    let score = oldestReal.score;
    const beforeMatches = matchData.filter((m) => m.timestamp < oldestReal.timestamp);
    for (const match of beforeMatches) {
      const lpChange = match.win ? 20 : -18;
      score = Math.max(0, score - lpChange);
      snapshots.push({ timestamp: match.timestamp, score, approximate: true });
    }
    snapshots.push(...realSnapshots);
  } else {
    // No real snapshots yet — estimate backwards from current LP but cap excursions
    const currentScore = toDisplayLp(tier, rank, lp, cutoffs);
    snapshots.push({ timestamp: Date.now(), score: currentScore, approximate: false });
    let score = currentScore;
    for (const match of matchData) {
      const lpChange = match.win ? 20 : -18;
      score = Math.max(0, score - lpChange);
      // Cap: never estimate more than 300 pts above the current score (prevents wild Challenger readings)
      score = Math.min(score, currentScore + 300);
      snapshots.push({ timestamp: match.timestamp, score, approximate: true });
    }
  }

  snapshots.sort((a, b) => a.timestamp - b.timestamp);
  return NextResponse.json({ snapshots: downsampleToHourly(snapshots), cutoffs: cutoffs ?? null });
}

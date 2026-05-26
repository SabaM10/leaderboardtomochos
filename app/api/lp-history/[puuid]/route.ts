import { NextRequest, NextResponse } from "next/server";
import { LpSnapshot, Tier, Division } from "@/lib/types";

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

// Maps tier+rank+lp to a linear 0-3400 scale (each division = 100, each tier = 400)
export function toDisplayLp(tier: string, rank: string | null, lp: number): number {
  const tierBase: Record<string, number> = {
    IRON: 0, BRONZE: 400, SILVER: 800, GOLD: 1200, PLATINUM: 1600,
    EMERALD: 2000, DIAMOND: 2400, MASTER: 2800, GRANDMASTER: 2900, CHALLENGER: 3000,
  };
  const rankAdd: Record<string, number> = { IV: 0, III: 100, II: 200, I: 300 };
  return (tierBase[tier] ?? 0) + (rank ? (rankAdd[rank] ?? 0) : 0) + Math.min(lp, 100);
}

// Inverse of toDisplayLp
function fromDisplayLp(score: number): { tier: Tier; rank: Division | null; lp: number } {
  const tiers: { tier: Tier; base: number; noDivision: boolean }[] = [
    { tier: "CHALLENGER", base: 3000, noDivision: true },
    { tier: "GRANDMASTER", base: 2900, noDivision: true },
    { tier: "MASTER", base: 2800, noDivision: true },
    { tier: "DIAMOND", base: 2400, noDivision: false },
    { tier: "EMERALD", base: 2000, noDivision: false },
    { tier: "PLATINUM", base: 1600, noDivision: false },
    { tier: "GOLD", base: 1200, noDivision: false },
    { tier: "SILVER", base: 800, noDivision: false },
    { tier: "BRONZE", base: 400, noDivision: false },
    { tier: "IRON", base: 0, noDivision: false },
  ];
  const clamped = Math.max(0, score);
  for (const { tier, base, noDivision } of tiers) {
    if (clamped >= base) {
      if (noDivision) return { tier, rank: null, lp: Math.min(clamped - base, 999) };
      const rem = clamped - base;
      const divIdx = Math.min(Math.floor(rem / 100), 3);
      return { tier, rank: (["IV", "III", "II", "I"] as Division[])[divIdx], lp: rem % 100 };
    }
  }
  return { tier: "IRON", rank: "IV", lp: 0 };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ puuid: string }> }
) {
  const { puuid } = await params;
  const tier = (req.nextUrl.searchParams.get("tier") ?? "UNRANKED") as Tier;
  const rank = req.nextUrl.searchParams.get("rank") as Division | null;
  const lp = parseInt(req.nextUrl.searchParams.get("lp") ?? "0");

  if (tier === "UNRANKED") return NextResponse.json([]);

  // Fetch 25 ranked solo match IDs
  const idsRes = await riotFetch(
    `https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?queue=420&count=25`
  );
  if (!idsRes.ok) return NextResponse.json([]);
  const matchIds: string[] = await idsRes.json();

  // Fetch win/loss + end timestamp for each match
  const matchData: { timestamp: number; win: boolean }[] = [];
  for (const matchId of matchIds) {
    const res = await riotFetch(
      `https://americas.api.riotgames.com/lol/match/v5/matches/${matchId}`
    );
    if (!res.ok) continue;
    const data = await res.json();
    const p = data.info.participants.find((x: { puuid: string }) => x.puuid === puuid);
    if (!p) continue;
    matchData.push({
      timestamp: data.info.gameCreation + data.info.gameDuration * 1000,
      win: p.win as boolean,
    });
  }

  // matchData is already newest-first; reconstruct backwards from current LP
  const snapshots: LpSnapshot[] = [];
  const currentScore = toDisplayLp(tier, rank, lp);

  // Today's real snapshot
  snapshots.push({ timestamp: Date.now(), score: currentScore, approximate: false });

  let score = currentScore;
  for (const match of matchData) {
    // This match caused a ±LP change, so BEFORE this match the score was the opposite
    const lpChange = match.win ? 20 : -18;
    score = score - lpChange;
    snapshots.push({ timestamp: match.timestamp, score, approximate: true });
  }

  snapshots.sort((a, b) => a.timestamp - b.timestamp);

  return NextResponse.json(snapshots);
}

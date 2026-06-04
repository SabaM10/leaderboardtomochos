import { NextRequest, NextResponse } from "next/server";
import { getLastMatches } from "@/lib/riot";
import { MatchResult } from "@/lib/types";

const BATCH = 3;

export async function GET(req: NextRequest) {
  // players param: "riotId1=puuid1,riotId2=puuid2,..."
  const raw = req.nextUrl.searchParams.get("players") ?? "";
  const entries = raw
    .split(",")
    .map((s) => s.split("="))
    .filter((p): p is [string, string] => p.length === 2 && !!p[0] && !!p[1]);

  const result: Record<string, MatchResult[]> = {};

  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    const settled = await Promise.allSettled(
      batch.map(([, puuid]) => getLastMatches(puuid))
    );
    settled.forEach((s, j) => {
      const riotId = batch[j][0];
      result[riotId] = s.status === "fulfilled" ? s.value : [];
    });
  }

  return NextResponse.json(result);
}

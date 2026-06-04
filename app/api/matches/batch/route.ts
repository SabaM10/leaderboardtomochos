import { NextRequest, NextResponse } from "next/server";
import { getLastMatches } from "@/lib/riot";
import { MatchResult } from "@/lib/types";
import { kv } from "@vercel/kv";

const BATCH = 4;
const CACHE_TTL = 300; // 5 min

function cacheKey(puuid: string) {
  return `matches:${puuid}`;
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("puuids") ?? "";
  const puuids = raw.split(",").filter(Boolean);
  if (!puuids.length) return NextResponse.json({});

  const result: Record<string, MatchResult[]> = {};
  const toFetch: string[] = [];

  // Read KV cache in parallel
  await Promise.all(
    puuids.map(async (puuid) => {
      try {
        const cached = await kv.get<MatchResult[]>(cacheKey(puuid));
        if (cached) { result[puuid] = cached; return; }
      } catch { /* KV unavailable */ }
      toFetch.push(puuid);
    })
  );

  // Fetch uncached players in batches
  for (let i = 0; i < toFetch.length; i += BATCH) {
    const batch = toFetch.slice(i, i + BATCH);
    const settled = await Promise.allSettled(batch.map((p) => getLastMatches(p)));
    await Promise.all(
      settled.map(async (s, j) => {
        const puuid = batch[j];
        const matches = s.status === "fulfilled" ? s.value : [];
        result[puuid] = matches;
        if (matches.length > 0) {
          try { await kv.set(cacheKey(puuid), matches, { ex: CACHE_TTL }); } catch { /* KV unavailable */ }
        }
      })
    );
  }

  return NextResponse.json(result);
}

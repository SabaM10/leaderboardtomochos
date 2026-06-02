import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { fetchAllPlayers } from "@/lib/riot";
import { FRIENDS } from "@/config/friends";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const players = await fetchAllPlayers(FRIENDS);
  const deleted: string[] = [];

  for (const p of players) {
    if (!p.puuid) continue;
    await kv.del(`leaderboard:lp-snapshots:${p.puuid}`);
    deleted.push(p.riotId);
  }

  return NextResponse.json({ message: "LP snapshots reseteados", deleted });
}

import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

export async function GET() {
  const data = await kv.get<Record<string, { t: number; pos: number }[]>>(
    "leaderboard:position-history"
  );
  return NextResponse.json(data ?? {});
}

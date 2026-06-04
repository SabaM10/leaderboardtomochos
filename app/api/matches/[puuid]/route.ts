import { NextRequest, NextResponse } from "next/server";
import { getLastMatches } from "@/lib/riot";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ puuid: string }> }
) {
  const { puuid } = await params;
  const matches = await getLastMatches(puuid);
  return NextResponse.json(matches);
}

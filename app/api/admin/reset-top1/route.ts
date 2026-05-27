import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";

const KV_KEY = "leaderboard:top1";

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const newValue: string | null = body.riotId ?? null;

  if (newValue) {
    await kv.set(KV_KEY, newValue);
    return NextResponse.json({ message: "Top1 actualizado", riotId: newValue });
  }

  await kv.del(KV_KEY);
  return NextResponse.json({ message: "Top1 reseteado (se detectará en el próximo cron)" });
}

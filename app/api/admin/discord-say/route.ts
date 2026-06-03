import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const text = req.nextUrl.searchParams.get("text");
  if (!text) return new NextResponse("Missing text", { status: 400 });

  const channelId = process.env.DISCORD_ALERT_CHANNEL_ID;
  const token = process.env.DISCORD_TOKEN;
  if (!channelId || !token) return new NextResponse("Missing Discord env vars", { status: 500 });

  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content: text }),
  });

  const data = await res.json();
  return NextResponse.json(data);
}

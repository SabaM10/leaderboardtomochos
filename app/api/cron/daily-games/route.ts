import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { fetchAllPlayers } from "@/lib/riot";
import { FRIENDS } from "@/config/friends";

const KV_BASELINE = "leaderboard:daily-games-baseline";

interface GamesBaseline {
  total: number;
  t: number;
}

async function sendDiscordMessage(content: string, channelOverride?: string | null) {
  const channelId = channelOverride || process.env.DISCORD_ALERT_CHANNEL_ID;
  const token = process.env.DISCORD_TOKEN;
  if (!channelId || !token) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (process.env.AUTO_MESSAGES_PAUSED === "1") {
    return NextResponse.json({ message: "Partidas diarias pausado (AUTO_MESSAGES_PAUSED=1)" });
  }
  const preview = req.nextUrl.searchParams.get("preview") === "1";
  const testChannel = req.nextUrl.searchParams.get("channel");

  const players = await fetchAllPlayers(FRIENDS);

  const baseline = (await kv.get<Record<string, GamesBaseline>>(KV_BASELINE)) ?? {};
  const now = Date.now();

  const newBaseline: Record<string, GamesBaseline> = {};
  for (const p of players) {
    if (!p.ranked) continue;
    newBaseline[p.riotId] = { total: p.ranked.wins + p.ranked.losses, t: now };
  }

  // Primera corrida: guardamos el baseline sin mandar mensaje
  if (Object.keys(baseline).length === 0) {
    await kv.set(KV_BASELINE, newBaseline);
    return NextResponse.json({ message: "Primera corrida - baseline guardado" });
  }

  const stats = players
    .filter((p) => p.ranked && baseline[p.riotId])
    .map((p) => {
      const base = baseline[p.riotId];
      const currentTotal = p.ranked!.wins + p.ranked!.losses;
      const gamesPlayed = Math.max(0, currentTotal - base.total);
      return { gameName: p.gameName, riotId: p.riotId, gamesPlayed };
    })
    .sort((a, b) => b.gamesPlayed - a.gamesPlayed);

  const roleId = process.env.DISCORD_LOL_ROLE_ID;
  const mention = roleId && !testChannel ? `<@&${roleId}> ` : "";
  const top = stats[0];

  const lines: string[] = [
    `${mention}🎮 **Partidas de SoloQ de ayer**`,
    "",
    ...stats.map((s) => `- **${s.gameName}**: ${s.gamesPlayed} partida${s.gamesPlayed === 1 ? "" : "s"}`),
  ];

  if (top && top.gamesPlayed > 0) {
    lines.push("", `🔥 **El más grindeador:** ${top.gameName} con ${top.gamesPlayed} partidas`);
  }

  await sendDiscordMessage(lines.join("\n"), testChannel);
  if (!preview) await kv.set(KV_BASELINE, newBaseline);

  return NextResponse.json({
    message: preview ? "Mensaje enviado (preview, baseline sin cambios)" : "Mensaje enviado",
    channel: testChannel || "default",
    stats,
  });
}

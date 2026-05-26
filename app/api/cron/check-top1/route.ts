import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { fetchAllPlayers } from "@/lib/riot";
import { FRIENDS } from "@/config/friends";
import { compareRank } from "@/lib/ranking";

const KV_KEY = "leaderboard:top1";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const players = await fetchAllPlayers(FRIENDS);
  const sorted = [...players].sort(compareRank);
  const top1 = sorted.find((p) => p.ranked && p.score > 0);

  if (!top1) {
    return NextResponse.json({ message: "No hay jugadores rankeados" });
  }

  const currentId = top1.riotId;
  const previousId = await kv.get<string>(KV_KEY);

  await kv.set(KV_KEY, currentId);

  // Primera corrida: guardar sin alertar
  if (!previousId) {
    return NextResponse.json({ message: "Primera corrida - guardado", top1: currentId });
  }

  if (previousId === currentId) {
    return NextResponse.json({ message: "Sin cambio", top1: currentId });
  }

  // Nuevo top 1 — mandar alerta
  const channelId = process.env.DISCORD_ALERT_CHANNEL_ID;
  const roleId = process.env.DISCORD_LOL_ROLE_ID;
  const token = process.env.DISCORD_TOKEN;

  if (!channelId || !roleId || !token) {
    return NextResponse.json(
      { error: "Faltan DISCORD_ALERT_CHANNEL_ID, DISCORD_LOL_ROLE_ID o DISCORD_TOKEN" },
      { status: 500 }
    );
  }

  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content: `<@&${roleId}> 🏆 **${top1.gameName}** es el nuevo jugador más competitivo del servidor!`,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    return NextResponse.json({ error: err }, { status: 500 });
  }

  return NextResponse.json({ message: "Alerta enviada", anterior: previousId, nuevo: currentId });
}

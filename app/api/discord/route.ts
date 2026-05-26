import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { verifyKey } from "discord-interactions";
import { fetchAllPlayers } from "@/lib/riot";
import { FRIENDS } from "@/config/friends";
import { buildLeaderboardEmbed, buildPlayerEmbed } from "@/lib/discord-format";

const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY!;
const APP_ID = process.env.DISCORD_APPLICATION_ID!;

async function getDDVersion(): Promise<string> {
  try {
    const res = await fetch("https://ddragon.leagueoflegends.com/api/versions.json");
    const versions: string[] = await res.json();
    return versions[0];
  } catch {
    return "14.24.1";
  }
}

async function followUp(token: string, body: object): Promise<void> {
  await fetch(`https://discord.com/api/v10/webhooks/${APP_ID}/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-signature-ed25519") ?? "";
  const timestamp = req.headers.get("x-signature-timestamp") ?? "";
  const rawBody = await req.text();

  const isValid = await verifyKey(rawBody, signature, timestamp, PUBLIC_KEY);
  if (!isValid) {
    return new NextResponse("Invalid request signature", { status: 401 });
  }

  const interaction = JSON.parse(rawBody);

  // Discord PING handshake
  if (interaction.type === 1) {
    return NextResponse.json({ type: 1 });
  }

  if (interaction.type === 2) {
    const name: string = interaction.data.name;
    const token: string = interaction.token;

    if (name === "tabla") {
      waitUntil(
        (async () => {
          const [players, ddVersion] = await Promise.all([
            fetchAllPlayers(FRIENDS),
            getDDVersion(),
          ]);
          await followUp(token, { embeds: [buildLeaderboardEmbed(players)] });
        })()
      );
      // Deferred response — Discord muestra "pensando..." mientras fetcheamos
      return NextResponse.json({ type: 5 });
    }

    if (name === "elo") {
      const riotId: string = interaction.data.options[0].value; // "gameName#tagLine"
      const [gameName, tagLine] = riotId.split("#");
      const friend = FRIENDS.find(
        (f) => f.gameName === gameName && f.tagLine === tagLine
      );

      if (!friend) {
        return NextResponse.json({
          type: 4,
          data: { content: "Jugador no encontrado.", flags: 64 },
        });
      }

      waitUntil(
        (async () => {
          const [players, ddVersion] = await Promise.all([
            fetchAllPlayers([friend]),
            getDDVersion(),
          ]);
          await followUp(token, { embeds: [buildPlayerEmbed(players[0], ddVersion)] });
        })()
      );
      return NextResponse.json({ type: 5 });
    }
  }

  return NextResponse.json({ type: 1 });
}

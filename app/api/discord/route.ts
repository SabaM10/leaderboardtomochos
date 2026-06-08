import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { fetchAllPlayers, getLastMatches } from "@/lib/riot";
import { FRIENDS } from "@/config/friends";
import { compareRank } from "@/lib/ranking";
import { buildLeaderboardEmbed, buildPlayerEmbed, buildKdaEmbed, buildAyudaEmbed } from "@/lib/discord-format";

const APP_ID = process.env.DISCORD_APPLICATION_ID!;

function hexToBytes(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes.buffer as ArrayBuffer;
}

async function verifySignature(
  publicKey: string,
  signature: string,
  timestamp: string,
  body: string
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      hexToBytes(publicKey),
      { name: "Ed25519" },
      false,
      ["verify"]
    );
    return await crypto.subtle.verify(
      "Ed25519",
      key,
      hexToBytes(signature),
      new TextEncoder().encode(timestamp + body)
    );
  } catch {
    return false;
  }
}

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

  const publicKey = process.env.DISCORD_PUBLIC_KEY ?? "";
  const isValid = await verifySignature(publicKey, signature, timestamp, rawBody);
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
          players.sort(compareRank);
          await Promise.all(
            players.map(async (p) => {
              if (!p.puuid) return;
              p.lastMatches = await getLastMatches(p.puuid);
            })
          );
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
          const p = players[0];
          if (p.puuid) p.lastMatches = await getLastMatches(p.puuid);
          await followUp(token, { embeds: [buildPlayerEmbed(p, ddVersion)] });
        })()
      );
      return NextResponse.json({ type: 5 });
    }

    if (name === "kda") {
      const riotId: string = interaction.data.options[0].value;
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
          const players = await fetchAllPlayers([friend]);
          const p = players[0];
          if (p.puuid) p.lastMatches = await getLastMatches(p.puuid);
          await followUp(token, { embeds: [buildKdaEmbed(p)] });
        })()
      );
      return NextResponse.json({ type: 5 });
    }

    if (name === "ayuda") {
      return NextResponse.json({
        type: 4,
        data: { embeds: [buildAyudaEmbed()] },
      });
    }
  }

  return NextResponse.json({ type: 1 });
}

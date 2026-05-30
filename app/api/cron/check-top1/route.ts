import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { fetchAllPlayers } from "@/lib/riot";
import { FRIENDS } from "@/config/friends";
import { compareRank, TIER_WEIGHTS } from "@/lib/ranking";
import { Tier, Division } from "@/lib/types";

const KV_KEY = "leaderboard:top1";
const KV_RANKS_KEY = "leaderboard:player-ranks";
const KV_LP_PREFIX = "leaderboard:lp-snapshots";
const KV_POSITIONS_KEY = "leaderboard:player-positions";
const KV_POSITION_CHANGES_KEY = "leaderboard:position-changes";
const LP_SNAPSHOT_MAX = 5000;

function toDisplayLp(tier: string, rank: string | null, lp: number): number {
  const tierBase: Record<string, number> = {
    IRON: 0, BRONZE: 400, SILVER: 800, GOLD: 1200, PLATINUM: 1600,
    EMERALD: 2000, DIAMOND: 2400, MASTER: 2800, GRANDMASTER: 2900, CHALLENGER: 3000,
  };
  const rankAdd: Record<string, number> = { IV: 0, III: 100, II: 200, I: 300 };
  return (tierBase[tier] ?? 0) + (rank ? (rankAdd[rank] ?? 0) : 0) + Math.min(lp, 100);
}

interface StoredRank {
  tier: Tier;
  rank: Division | null;
}

type StoredRanks = Record<string, StoredRank>;

function formatTier(tier: Tier, rank: Division | null): string {
  const names: Record<Tier, string> = {
    CHALLENGER: "Challenger",
    GRANDMASTER: "Grandmaster",
    MASTER: "Master",
    DIAMOND: "Diamante",
    EMERALD: "Esmeralda",
    PLATINUM: "Platino",
    GOLD: "Oro",
    SILVER: "Plata",
    BRONZE: "Bronce",
    IRON: "Hierro",
    UNRANKED: "Sin rango",
  };
  const name = names[tier] ?? tier;
  if (rank && !["CHALLENGER", "GRANDMASTER", "MASTER"].includes(tier)) {
    return `${name} ${rank}`;
  }
  return name;
}

async function sendDiscordMessage(content: string) {
  const channelId = process.env.DISCORD_ALERT_CHANNEL_ID;
  const token = process.env.DISCORD_TOKEN;
  if (!channelId || !token) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
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

  const players = await fetchAllPlayers(FRIENDS);
  const sorted = [...players].sort(compareRank);
  const top1 = sorted.find((p) => p.ranked && p.score > 0);

  const tierOrder: Tier[] = [
    "IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM",
    "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER",
  ];

  const simulateDemotion = req.nextUrl.searchParams.get("simulate");
  const simulatePromotion = req.nextUrl.searchParams.get("simulatepro");
  const simulateOvertake = req.nextUrl.searchParams.get("simulateovertake");
  const [previousRanksRaw, previousPositions] = await Promise.all([
    kv.get<StoredRanks>(KV_RANKS_KEY),
    kv.get<Record<string, number>>(KV_POSITIONS_KEY),
  ]);
  const previousRanks: StoredRanks = previousRanksRaw ?? {};
  const resolvedPreviousPositions: Record<string, number> = previousPositions ?? {};

  // Simulate demotion: set previous tier one above current
  if (simulateDemotion) {
    const target = players.find((p) => p.riotId === simulateDemotion);
    if (target?.ranked) {
      const idx = tierOrder.indexOf(target.ranked.tier);
      if (idx < tierOrder.length - 1) {
        previousRanks[simulateDemotion] = { tier: tierOrder[idx + 1], rank: null };
      }
    }
  }

  // Simulate promotion: set previous tier one below current
  if (simulatePromotion) {
    const target = players.find((p) => p.riotId === simulatePromotion);
    if (target?.ranked) {
      const idx = tierOrder.indexOf(target.ranked.tier);
      if (idx > 0) {
        previousRanks[simulatePromotion] = { tier: tierOrder[idx - 1], rank: "I" };
      }
    }
  }

  // Simulate overtake: fake previous positions so the target appears to have climbed 2+ spots
  if (simulateOvertake) {
    const targetIdx = sorted.findIndex((p) => p.riotId === simulateOvertake);
    if (targetIdx !== -1) {
      const fakeFrom = targetIdx + 2;
      // Assign every current player their current position as "previous", then move target back
      sorted.forEach((p, i) => { resolvedPreviousPositions[p.riotId] = i; });
      resolvedPreviousPositions[simulateOvertake] = fakeFrom;
      // Shift the two overtaken players up by one in the fake previous so positions are consistent
      if (sorted[targetIdx + 1]) resolvedPreviousPositions[sorted[targetIdx + 1].riotId] = targetIdx;
      if (sorted[targetIdx + 2]) resolvedPreviousPositions[sorted[targetIdx + 2].riotId] = targetIdx + 1;
    }
  }

  const currentRanks: StoredRanks = {};

  for (const player of players) {
    if (player.ranked) {
      currentRanks[player.riotId] = {
        tier: player.ranked.tier,
        rank: player.ranked.rank ?? null,
      };
    }
  }

  // Merge instead of overwrite: players that errored this run keep their last
  // known rank so the next successful run can still detect tier changes.
  const mergedRanks: StoredRanks = { ...previousRanks, ...currentRanks };
  await kv.set(KV_RANKS_KEY, mergedRanks);

  // Save LP snapshots for accurate graph history
  const now = Date.now();
  await Promise.all(
    players
      .filter((p) => p.puuid && p.ranked)
      .map(async (p) => {
        const score = toDisplayLp(p.ranked!.tier, p.ranked!.rank ?? null, p.ranked!.leaguePoints);
        const key = `${KV_LP_PREFIX}:${p.puuid}`;
        const existing = (await kv.get<{ t: number; s: number }[]>(key)) ?? [];
        const last = existing[existing.length - 1];
        if (last && now - last.t < 60_000) return; // skip if saved less than a minute ago
        existing.push({ t: now, s: score });
        if (existing.length > LP_SNAPSHOT_MAX) existing.splice(0, existing.length - LP_SNAPSHOT_MAX);
        await kv.set(key, existing);
      })
  );

  const demotions: string[] = [];
  const promotions: string[] = [];

  if (Object.keys(previousRanks).length > 0) {
    for (const player of players) {
      if (!player.ranked) continue;
      const prev = previousRanks[player.riotId];
      if (!prev) continue;

      const prevWeight = TIER_WEIGHTS[prev.tier] ?? 0;
      const currWeight = TIER_WEIGHTS[player.ranked.tier] ?? 0;
      const roleId = process.env.DISCORD_LOL_ROLE_ID;
      const mention = roleId ? `<@&${roleId}> ` : "";

      if (currWeight < prevWeight) {
        const fromLabel = formatTier(prev.tier, prev.rank);
        const toLabel = formatTier(player.ranked.tier, player.ranked.rank ?? null);
        demotions.push(`${player.gameName}: ${fromLabel} → ${toLabel}`);
        await sendDiscordMessage(
          `${mention}📉 **${player.gameName}** bajó de **${fromLabel}** a **${toLabel}** 💀`
        );
      } else if (currWeight > prevWeight) {
        const fromLabel = formatTier(prev.tier, prev.rank);
        const toLabel = formatTier(player.ranked.tier, player.ranked.rank ?? null);
        promotions.push(`${player.gameName}: ${fromLabel} → ${toLabel}`);
        await sendDiscordMessage(
          `${mention}📈 **${player.gameName}** subió de **${fromLabel}** a **${toLabel}** 🎉`
        );
      }
    }
  }

  // --- Position tracking + overtake alerts ---
  const currentPositions: Record<string, number> = {};
  sorted.forEach((p, i) => { currentPositions[p.riotId] = i; });

  const positionChanges: Record<string, number> = {};
  const overtakes: string[] = [];

  if (Object.keys(resolvedPreviousPositions).length > 0) {
    const prevPosByPos: Record<number, string> = {};
    for (const [riotId, pos] of Object.entries(resolvedPreviousPositions)) {
      prevPosByPos[pos] = riotId;
    }

    for (const player of sorted) {
      const prev = resolvedPreviousPositions[player.riotId];
      const curr = currentPositions[player.riotId];
      if (prev === undefined) continue;
      const delta = prev - curr;
      positionChanges[player.riotId] = delta;

      if (delta >= 2) {
        const overtakenNames: string[] = [];
        for (let pos = curr; pos < prev; pos++) {
          const overtakenId = prevPosByPos[pos];
          if (overtakenId && overtakenId !== player.riotId) {
            const overtakenPlayer = players.find((p) => p.riotId === overtakenId);
            if (overtakenPlayer) overtakenNames.push(overtakenPlayer.gameName);
          }
        }
        if (overtakenNames.length >= 2) {
          const mention = process.env.DISCORD_LOL_ROLE_ID ? `<@&${process.env.DISCORD_LOL_ROLE_ID}> ` : "";
          const last = overtakenNames.at(-1)!;
          const rest = overtakenNames.slice(0, -1);
          const nameList = rest.length > 0
            ? `**${rest.join("**, **")}** y **${last}**`
            : `**${last}**`;
          const msg = `${mention}🔺 **${player.gameName}** superó a ${nameList} en el ranking!`;
          overtakes.push(`${player.gameName} +${delta}: ${overtakenNames.join(", ")}`);
          await sendDiscordMessage(msg);
        } else {
          overtakes.push(`${player.gameName} +${delta} (no se mandó alerta: solo ${overtakenNames.length} nombres encontrados)`);
        }
      }
    }
  } else {
    overtakes.push("sin posiciones previas en KV");
  }

  await Promise.all([
    kv.set(KV_POSITIONS_KEY, currentPositions),
    kv.set(KV_POSITION_CHANGES_KEY, positionChanges),
  ]);

  // --- Top 1 detection ---
  if (!top1) {
    return NextResponse.json({ message: "No hay jugadores rankeados", demotions, promotions, overtakes });
  }

  const currentId = top1.riotId;
  const previousId = await kv.get<string>(KV_KEY);

  if (!previousId) {
    await kv.set(KV_KEY, currentId);
    return NextResponse.json({ message: "Primera corrida - guardado", top1: currentId, demotions, promotions, overtakes });
  }

  if (previousId === currentId) {
    return NextResponse.json({ message: "Sin cambio", top1: currentId, demotions, promotions, overtakes });
  }

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

  // Solo actualizamos el KV después de que la alerta se envió exitosamente,
  // para que si falla, el próximo cron pueda reintentarlo.
  await kv.set(KV_KEY, currentId);

  return NextResponse.json({ message: "Alerta enviada", anterior: previousId, nuevo: currentId, demotions, promotions });
}

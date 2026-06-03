import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { fetchAllPlayers } from "@/lib/riot";
import { FRIENDS } from "@/config/friends";
import { compareRank } from "@/lib/ranking";
import { toDisplayLp } from "@/lib/lp";
import { TierCutoffs } from "@/lib/types";

const KV_WEEKLY_BASELINE = "leaderboard:weekly-baseline";
const KV_CUTOFFS_KEY = "leaderboard:tier-cutoffs";

interface WeeklyBaseline {
  score: number;
  wins: number;
  losses: number;
  t: number;
}

function scoreToLabel(score: number): string {
  const tiers = [
    { label: "Challenger", base: 3000, noDivision: true },
    { label: "Grandmaster", base: 2900, noDivision: true },
    { label: "Master", base: 2800, noDivision: true },
    { label: "Diamante", base: 2400, noDivision: false },
    { label: "Esmeralda", base: 2000, noDivision: false },
    { label: "Platino", base: 1600, noDivision: false },
    { label: "Oro", base: 1200, noDivision: false },
    { label: "Plata", base: 800, noDivision: false },
    { label: "Bronce", base: 400, noDivision: false },
    { label: "Hierro", base: 0, noDivision: false },
  ];
  for (const t of tiers) {
    if (score >= t.base) {
      if (t.noDivision) return t.label;
      const div = (["IV", "III", "II", "I"])[Math.min(Math.floor((score - t.base) / 100), 3)];
      return `${t.label} ${div}`;
    }
  }
  return "Hierro IV";
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

  const [players, cutoffs] = await Promise.all([
    fetchAllPlayers(FRIENDS),
    kv.get<TierCutoffs>(KV_CUTOFFS_KEY),
  ]);
  players.sort(compareRank);

  const baseline = (await kv.get<Record<string, WeeklyBaseline>>(KV_WEEKLY_BASELINE)) ?? {};
  const now = Date.now();

  const newBaseline: Record<string, WeeklyBaseline> = {};
  for (const p of players) {
    if (!p.ranked || !p.riotId) continue;
    newBaseline[p.riotId] = {
      score: toDisplayLp(p.ranked.tier, p.ranked.rank ?? null, p.ranked.leaguePoints, cutoffs ?? undefined),
      wins: p.ranked.wins,
      losses: p.ranked.losses,
      t: now,
    };
  }

  // First run: save baseline silently
  if (Object.keys(baseline).length === 0) {
    await kv.set(KV_WEEKLY_BASELINE, newBaseline);
    return NextResponse.json({ message: "Primera corrida - baseline guardado" });
  }

  // Compute weekly stats per player
  const stats = players
    .filter((p) => p.ranked && baseline[p.riotId])
    .map((p) => {
      const base = baseline[p.riotId];
      const currentScore = toDisplayLp(p.ranked!.tier, p.ranked!.rank ?? null, p.ranked!.leaguePoints, cutoffs ?? undefined);
      const lpDelta = currentScore - base.score;
      const gamesPlayed = (p.ranked!.wins + p.ranked!.losses) - (base.wins + base.losses);
      return { gameName: p.gameName, lpDelta, gamesPlayed, currentScore, riotId: p.riotId };
    });

  const mvp = [...stats].sort((a, b) => b.lpDelta - a.lpDelta)[0];
  const worst = [...stats].sort((a, b) => a.lpDelta - b.lpDelta)[0];
  const roleId = process.env.DISCORD_LOL_ROLE_ID;
  const mention = roleId ? `<@&${roleId}>` : "";

  const lines: string[] = [
    `${mention} 📊 **Recap semanal de Tomochos**`,
    "",
    "**📋 Ranking actual:**",
    ...players
      .filter((p) => p.ranked)
      .map((p, i) => {
        const s = stats.find((x) => x.riotId === p.riotId);
        const delta = Math.round(s?.lpDelta ?? 0);
        const arrow = delta > 0 ? `▲${delta} LP` : delta < 0 ? `▼${Math.abs(delta)} LP` : `→ 0 LP`;
        const label = scoreToLabel(toDisplayLp(p.ranked!.tier, p.ranked!.rank ?? null, p.ranked!.leaguePoints, cutoffs ?? undefined));
        const games = s?.gamesPlayed ?? 0;
        return `${i + 1}. **${p.gameName}** · ${label} · ${arrow} · ${games} partidas`;
      }),
    "",
    ...(mvp?.lpDelta > 0 ? [`🏆 **MVP de la semana:** ${mvp.gameName} (+${Math.round(mvp.lpDelta)} LP en ${mvp.gamesPlayed} partidas)`] : []),
    ...(worst?.lpDelta < 0 ? [`💀 **El que más cayó:** ${worst.gameName} (${Math.round(worst.lpDelta)} LP en ${worst.gamesPlayed} partidas)`] : []),
  ];

  await sendDiscordMessage(lines.join("\n"));
  await kv.set(KV_WEEKLY_BASELINE, newBaseline);

  return NextResponse.json({ message: "Recap enviado", stats });
}

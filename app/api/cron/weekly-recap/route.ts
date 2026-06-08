import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { fetchAllPlayers } from "@/lib/riot";
import { FRIENDS } from "@/config/friends";
import { compareRank } from "@/lib/ranking";
import { toDisplayLp } from "@/lib/lp";
import { TierCutoffs } from "@/lib/types";

const TIER_BASE: Record<string, number> = {
  IRON: 0, BRONZE: 400, SILVER: 800, GOLD: 1200, PLATINUM: 1600,
  EMERALD: 2000, DIAMOND: 2400, MASTER: 2800, GRANDMASTER: 2900, CHALLENGER: 3000,
};
const RANK_ADD: Record<string, number> = { IV: 0, III: 100, II: 200, I: 300 };

function weeklyLpDelta(
  baseTier: string, baseRank: string | null, baseLp: number,
  curTier: string, curRank: string | null, curLp: number,
): number {
  if (baseTier === curTier) return curLp - baseLp;
  // Tier change — use fixed base values so there's no gmMin dependency
  const baseScore = (TIER_BASE[baseTier] ?? 0) + (baseRank ? (RANK_ADD[baseRank] ?? 0) : 0) + Math.min(baseLp, 100);
  const curScore  = (TIER_BASE[curTier]  ?? 0) + (curRank  ? (RANK_ADD[curRank]  ?? 0) : 0) + Math.min(curLp, 100);
  return curScore - baseScore;
}

const KV_WEEKLY_BASELINE = "leaderboard:weekly-baseline";
const KV_CUTOFFS_KEY = "leaderboard:tier-cutoffs";

interface WeeklyBaseline {
  score: number;
  tier: string;
  rank: string | null;
  lp: number;
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
  const preview = req.nextUrl.searchParams.get("preview") === "1";

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
      tier: p.ranked.tier,
      rank: p.ranked.rank ?? null,
      lp: p.ranked.leaguePoints,
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

  // Fetch games played since baseline timestamp — one match-IDs call per player, all in parallel
  const baselineTs = Object.values(baseline)[0]?.t ?? 0;
  const startTimeSecs = Math.floor(baselineTs / 1000);
  const gamesPlayedMap = Object.fromEntries(
    await Promise.all(
      players
        .filter((p) => p.puuid && baseline[p.riotId])
        .map(async (p) => {
          try {
            const res = await fetch(
              `https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(p.puuid!)}/ids?queue=420&startTime=${startTimeSecs}&count=100`,
              { headers: { "X-Riot-Token": process.env.RIOT_API_KEY! } }
            );
            const ids: string[] = res.ok ? await res.json() : [];
            return [p.riotId, ids.length] as [string, number];
          } catch {
            return [p.riotId, 0] as [string, number];
          }
        })
    )
  );

  // Compute weekly stats per player
  const stats = players
    .filter((p) => p.ranked && baseline[p.riotId])
    .map((p) => {
      const base = baseline[p.riotId];
      const lpDelta = weeklyLpDelta(
        base.tier ?? p.ranked!.tier, base.rank ?? null, base.lp ?? 0,
        p.ranked!.tier, p.ranked!.rank ?? null, p.ranked!.leaguePoints,
      );
      const currentScore = toDisplayLp(p.ranked!.tier, p.ranked!.rank ?? null, p.ranked!.leaguePoints, cutoffs ?? undefined);
      const gamesPlayed = gamesPlayedMap[p.riotId] ?? 0;
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
        const arrow = delta > 0 ? `+${delta} LP` : delta < 0 ? `${delta} LP` : `0 LP`;
        const label = scoreToLabel(toDisplayLp(p.ranked!.tier, p.ranked!.rank ?? null, p.ranked!.leaguePoints, cutoffs ?? undefined));
        const games = s?.gamesPlayed ?? 0;
        return `${i + 1}. **${p.gameName}** · ${label} · ${arrow} · ${games} partidas`;
      }),
    "",
    ...(mvp?.lpDelta > 0 ? [`🏆 **MVP de la semana:** ${mvp.gameName} (+${Math.round(mvp.lpDelta)} LP en ${mvp.gamesPlayed} partidas)`] : []),
    ...(worst?.lpDelta < 0 ? [`💀 **El que más cayó:** ${worst.gameName} (${Math.round(worst.lpDelta)} LP en ${worst.gamesPlayed} partidas)`] : []),
  ];

  await sendDiscordMessage(lines.join("\n"));
  if (!preview) await kv.set(KV_WEEKLY_BASELINE, newBaseline);

  return NextResponse.json({ message: preview ? "Recap enviado (preview, baseline sin cambios)" : "Recap enviado", stats });
}

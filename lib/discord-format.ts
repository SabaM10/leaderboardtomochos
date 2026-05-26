import { Player } from "@/lib/types";
import { winrate } from "@/lib/ranking";

const TIER_EMOJI: Record<string, string> = {
  CHALLENGER:  "🏆",
  GRANDMASTER: "💎",
  MASTER:      "🔮",
  DIAMOND:     "💠",
  EMERALD:     "💚",
  PLATINUM:    "🔷",
  GOLD:        "🥇",
  SILVER:      "🥈",
  BRONZE:      "🥉",
  IRON:        "⚙️",
};

const TIER_COLOR: Record<string, number> = {
  CHALLENGER:  0xF4C95F,
  GRANDMASTER: 0xC04000,
  MASTER:      0x9B4DC0,
  DIAMOND:     0x57A8DE,
  EMERALD:     0x50C878,
  PLATINUM:    0x4BC0A0,
  GOLD:        0xF0A500,
  SILVER:      0xA8A8A8,
  BRONZE:      0xC9734B,
  IRON:        0x8C8177,
};

const NO_DIVISION = new Set(["CHALLENGER", "GRANDMASTER", "MASTER"]);

function rankLabel(player: Player): string {
  if (!player.ranked) return "Sin rankear";
  const { tier, rank, leaguePoints } = player.ranked;
  const emoji = TIER_EMOJI[tier] ?? "";
  const div = NO_DIVISION.has(tier) ? "" : ` ${rank}`;
  return `${emoji} ${tier}${div} • ${leaguePoints} LP`;
}

export function buildLeaderboardEmbed(players: Player[]): object {
  const MEDALS = ["🥇", "🥈", "🥉"];

  const lines = players.map((p, i) => {
    const pos = MEDALS[i] ?? `**${i + 1}.**`;
    const wr = p.ranked
      ? ` | ${winrate(p.ranked.wins, p.ranked.losses).toFixed(1)}% WR`
      : "";
    const live = p.live ? " 🔴" : "";
    const hot = p.ranked?.hotStreak ? " 🔥" : "";
    const matches = p.lastMatches.length
      ? p.lastMatches.map((m) => (m.win ? "✅" : "❌")).join(" ")
      : "—";
    return `${pos} **${p.gameName}**#${p.tagLine}${live}${hot}\n> ${rankLabel(p)}${wr} | ${matches}`;
  });

  return {
    title: "🏆 Leaderboard de los mochos",
    description: lines.join("\n\n"),
    color: 0xF0A500,
    timestamp: new Date().toISOString(),
  };
}

export function buildPlayerEmbed(player: Player, ddVersion: string): object {
  if (!player.ranked && player.error) {
    return {
      title: `${player.gameName}#${player.tagLine}`,
      description: `No se pudo obtener datos: ${player.error}`,
      color: 0x636363,
    };
  }

  const tier = player.ranked?.tier ?? "UNRANKED";
  const color = TIER_COLOR[tier] ?? 0x636363;
  const fields: object[] = [];

  if (player.ranked) {
    const { tier, rank, leaguePoints, wins, losses, hotStreak } = player.ranked;
    const wr = winrate(wins, losses);
    const div = NO_DIVISION.has(tier) ? "" : ` ${rank}`;
    fields.push(
      { name: "Elo", value: `${TIER_EMOJI[tier] ?? ""} ${tier}${div}\n${leaguePoints} LP`, inline: true },
      { name: "Partidas", value: `${wins}W / ${losses}L`, inline: true },
      { name: "Winrate", value: `${wr.toFixed(1)}%${hotStreak ? " 🔥" : ""}`, inline: true },
    );
  } else {
    fields.push({ name: "Elo", value: "Sin rankear", inline: false });
  }

  if (player.lastMatches.length) {
    const dots = player.lastMatches.map((m) => (m.win ? "✅" : "❌")).join(" ");
    const details = player.lastMatches
      .map((m) => {
        const mins = Math.floor(m.durationSecs / 60);
        const kda =
          m.deaths === 0
            ? "Perfect"
            : ((m.kills + m.assists) / m.deaths).toFixed(2);
        return `${m.championName} — ${m.kills}/${m.deaths}/${m.assists} (${kda} KDA) · ${mins}m`;
      })
      .join("\n");
    fields.push({ name: "Últimas partidas", value: `${dots}\n${details}`, inline: false });
  }

  if (player.topChampionName) {
    fields.push({ name: "Campeón favorito", value: player.topChampionName, inline: true });
  }

  const thumbnail = player.profileIconId
    ? { url: `https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/profileicon/${player.profileIconId}.png` }
    : undefined;

  return {
    title: `${player.live ? "🔴 " : ""}${player.gameName}#${player.tagLine}`,
    fields,
    color,
    thumbnail,
    timestamp: new Date().toISOString(),
  };
}

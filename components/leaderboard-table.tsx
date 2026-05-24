import { Player } from "@/lib/types";
import { winrate } from "@/lib/ranking";

const TIER_META: Record<string, { slug: string }> = {
  CHALLENGER:  { slug: "challenger"  },
  GRANDMASTER: { slug: "grandmaster" },
  MASTER:      { slug: "master"      },
  DIAMOND:     { slug: "diamond"     },
  EMERALD:     { slug: "emerald"     },
  PLATINUM:    { slug: "platinum"    },
  GOLD:        { slug: "gold"        },
  SILVER:      { slug: "silver"      },
  BRONZE:      { slug: "bronze"      },
  IRON:        { slug: "iron"        },
};

const RANK_BORDER: Record<number, string> = {
  0: "border-l-2 border-l-amber-500/70",
  1: "border-l-2 border-l-zinc-400/50",
  2: "border-l-2 border-l-amber-800/60",
};

const RANK_NUM_COLOR: Record<number, string> = {
  0: "text-amber-400",
  1: "text-zinc-300",
  2: "text-amber-700",
};

const NO_DIVISION_TIERS = new Set(["CHALLENGER", "GRANDMASTER", "MASTER"]);
const TH = "px-4 py-3 text-xs font-semibold tracking-widest uppercase text-zinc-500";

const SPLASH = (name: string) =>
  `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${name}_0.jpg`;

function rowBackground(championName: string | null): React.CSSProperties {
  if (!championName) return {};
  return {
    backgroundImage: `linear-gradient(to right, rgba(7,7,15,0.97) 30%, rgba(7,7,15,0.82) 55%, rgba(7,7,15,0.45) 80%, rgba(7,7,15,0.15) 100%), url(${SPLASH(championName)})`,
    backgroundSize: "cover",
    backgroundPosition: "right 25%",
  };
}

function TierIcon({ tier }: { tier: string }) {
  const meta = TIER_META[tier];
  if (!meta) return <div className="w-10 h-10" />;
  const ext = meta.slug === "emerald" ? "svg" : "png";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/tiers/${meta.slug}.${ext}`} alt={tier} width={40} height={40} className="object-contain drop-shadow-md" />
  );
}

function LiveBadge({ gameStartTime, gameName, tagLine }: { gameStartTime: number; gameName: string; tagLine: string }) {
  const elapsedMin = Math.floor((Date.now() - gameStartTime) / 60000);
  const opggUrl = `https://www.op.gg/summoners/las/${encodeURIComponent(gameName)}-${encodeURIComponent(tagLine)}/ingame`;
  return (
    <a href={opggUrl} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/40 text-red-400 text-xs font-bold tracking-wider hover:bg-red-500/25 transition-colors">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
      LIVE
      <span className="text-red-500/60 font-normal">{elapsedMin}m</span>
    </a>
  );
}

function MatchDots({ matches }: { matches: { win: boolean }[] }) {
  if (!matches.length) return <span className="text-zinc-700 text-xs">—</span>;
  return (
    <div className="inline-flex items-center gap-1 bg-black/50 backdrop-blur-sm px-2 py-1.5 rounded-lg">
      {matches.map((m, i) => (
        <span
          key={i}
          title={m.win ? "Victoria" : "Derrota"}
          className={`w-3 h-3 rounded-sm shadow-sm ${m.win ? "bg-emerald-500 shadow-emerald-900/50" : "bg-red-500 shadow-red-900/50"}`}
        />
      ))}
    </div>
  );
}

export default function LeaderboardTable({ players }: { players: Player[] }) {
  return (
    <div className="rounded-2xl border border-white/5 overflow-hidden bg-white/[0.03] backdrop-blur-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-white/5 bg-white/[0.03]">
              <th className={`${TH} text-left w-12`}>#</th>
              <th className={`${TH} text-left`}>Jugador</th>
              <th className={`${TH} text-center`}>Tier</th>
              <th className={`${TH} text-center`}>Div</th>
              <th className={`${TH} text-right`}>LP</th>
              <th className={`${TH} text-right`}>W / L</th>
              <th className={`${TH} text-right`}>Winrate</th>
              <th className={`${TH} text-right`}>Forma</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {players.map((player, i) => {
              const ranked = player.ranked;
              const wr = ranked ? winrate(ranked.wins, ranked.losses) : null;
              const borderClass = RANK_BORDER[i] ?? "";
              const numColor = RANK_NUM_COLOR[i] ?? "text-zinc-600";

              return (
                <tr
                  key={player.riotId}
                  className={`transition-all hover:brightness-75 ${borderClass}`}
                  style={rowBackground(player.topChampionName)}
                >
                  {/* position */}
                  <td className="px-4 py-5">
                    <span className={`text-sm font-black tabular-nums ${numColor}`}>{i + 1}</span>
                  </td>

                  {/* player */}
                  <td className="px-4 py-5">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-semibold ${player.error ? "text-zinc-600 italic" : "text-zinc-100"}`}>
                          {player.gameName}
                        </span>
                        <span className="text-zinc-500 text-xs">#{player.tagLine}</span>
                        {ranked?.hotStreak && (
                          <span title="Racha ganadora" className="text-base leading-none">🔥</span>
                        )}
                        {player.live && (
                          <LiveBadge
                            gameStartTime={player.live.gameStartTime}
                            gameName={player.gameName}
                            tagLine={player.tagLine}
                          />
                        )}
                      </div>
                      {player.topChampionName && (
                        <span className="text-zinc-600 text-xs">{player.topChampionName}</span>
                      )}
                    </div>
                  </td>

                  {/* tier icon */}
                  <td className="px-4 py-4 text-center">
                    <div className="flex justify-center">
                      {ranked
                        ? <TierIcon tier={ranked.tier} />
                        : <span className="text-zinc-600 text-xs">—</span>}
                    </div>
                  </td>

                  {/* division */}
                  <td className="px-4 py-5 text-center text-zinc-400 font-mono">
                    {ranked && !NO_DIVISION_TIERS.has(ranked.tier) ? ranked.rank : "—"}
                  </td>

                  {/* LP */}
                  <td className="px-4 py-5 text-right font-mono font-semibold text-zinc-200">
                    {ranked ? (
                      <>{ranked.leaguePoints}<span className="text-zinc-600 text-xs ml-0.5">lp</span></>
                    ) : "—"}
                  </td>

                  {/* W / L */}
                  <td className="px-4 py-5 text-right font-mono text-xs whitespace-nowrap">
                    {ranked ? (
                      <>
                        <span className="text-emerald-400">{ranked.wins}W</span>
                        <span className="text-zinc-600 mx-1">/</span>
                        <span className="text-red-400">{ranked.losses}L</span>
                      </>
                    ) : <span className="text-zinc-600">—</span>}
                  </td>

                  {/* winrate */}
                  <td className="px-4 py-5 text-right font-mono font-bold">
                    {wr !== null ? (
                      <span className={wr >= 50 ? "text-emerald-400" : "text-red-400"}>
                        {wr.toFixed(1)}%
                      </span>
                    ) : <span className="text-zinc-600">—</span>}
                  </td>

                  {/* last 5 matches */}
                  <td className="px-4 py-5 text-right">
                    <MatchDots matches={player.lastMatches} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

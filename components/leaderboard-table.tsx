import { Player } from "@/lib/types";
import { winrate } from "@/lib/ranking";

const TIER_META: Record<string, { slug: string; label: string }> = {
  CHALLENGER:  { slug: "challenger",  label: "Challenger"  },
  GRANDMASTER: { slug: "grandmaster", label: "GrandMaster" },
  MASTER:      { slug: "master",      label: "Master"      },
  DIAMOND:     { slug: "diamond",     label: "Diamond"     },
  EMERALD:     { slug: "emerald",     label: "Emerald"     },
  PLATINUM:    { slug: "platinum",    label: "Platinum"    },
  GOLD:        { slug: "gold",        label: "Gold"        },
  SILVER:      { slug: "silver",      label: "Silver"      },
  BRONZE:      { slug: "bronze",      label: "Bronze"      },
  IRON:        { slug: "iron",        label: "Iron"        },
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

function cardBackground(championName: string | null): React.CSSProperties {
  if (!championName) return {};
  return {
    backgroundImage: `linear-gradient(to right, rgba(7,7,15,0.95) 40%, rgba(7,7,15,0.75) 65%, rgba(7,7,15,0.3) 100%), url(${SPLASH(championName)})`,
    backgroundSize: "cover",
    backgroundPosition: "right 25%",
  };
}

function TierIcon({ tier, size = 40 }: { tier: string; size?: number }) {
  const meta = TIER_META[tier];
  if (!meta) return <div style={{ width: size, height: size }} />;
  const ext = meta.slug === "emerald" ? "svg" : "png";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/tiers/${meta.slug}.${ext}`} alt={tier} width={size} height={size} className="object-contain drop-shadow-md" />
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
        <span key={i} title={m.win ? "Victoria" : "Derrota"}
          className={`w-3 h-3 rounded-sm shadow-sm ${m.win ? "bg-emerald-500 shadow-emerald-900/50" : "bg-red-500 shadow-red-900/50"}`}
        />
      ))}
    </div>
  );
}

function ProfileIcon({ iconId, ddVersion, size = 32 }: { iconId: number | null; ddVersion: string; size?: number }) {
  if (iconId === null) return <div style={{ width: size, height: size }} className="rounded-full bg-zinc-800" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/profileicon/${iconId}.png`}
      alt="icon"
      width={size}
      height={size}
      className="rounded-full object-cover ring-1 ring-white/10"
    />
  );
}

// ─── Mobile card ────────────────────────────────────────────────────────────

function PlayerCard({ player, pos, ddVersion }: { player: Player; pos: number; ddVersion: string }) {
  const ranked = player.ranked;
  const wr = ranked ? winrate(ranked.wins, ranked.losses) : null;
  const borderClass = RANK_BORDER[pos] ?? "border-l-2 border-l-transparent";
  const numColor = RANK_NUM_COLOR[pos] ?? "text-zinc-600";
  const division = ranked && !NO_DIVISION_TIERS.has(ranked.tier) ? ` ${ranked.rank}` : "";
  const tierLabel = ranked ? `${TIER_META[ranked.tier]?.label ?? ranked.tier}${division}` : "Unranked";

  return (
    <div
      className={`relative rounded-xl overflow-hidden border border-white/5 ${borderClass}`}
      style={cardBackground(player.topChampionName)}
    >
      <div className="px-4 py-4 flex flex-col gap-3">
        {/* top row: position + icon + name + badges */}
        <div className="flex items-center gap-3">
          <span className={`text-lg font-black tabular-nums w-6 shrink-0 ${numColor}`}>{pos + 1}</span>
          <ProfileIcon iconId={player.profileIconId} ddVersion={ddVersion} size={36} />
          {ranked && <TierIcon tier={ranked.tier} size={36} />}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`font-bold text-base leading-tight ${player.error ? "text-zinc-600 italic" : "text-zinc-100"}`}>
                {player.gameName}
              </span>
              <span className="text-zinc-500 text-xs">#{player.tagLine}</span>
              {ranked?.hotStreak && <span className="text-base leading-none">🔥</span>}
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-zinc-500 text-xs">{tierLabel}</span>
              {player.topChampionName && (
                <span className="text-zinc-600 text-xs">· {player.topChampionName}</span>
              )}
            </div>
          </div>
          {player.live && (
            <LiveBadge
              gameStartTime={player.live.gameStartTime}
              gameName={player.gameName}
              tagLine={player.tagLine}
            />
          )}
        </div>

        {/* bottom row: stats */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* LP */}
            <div className="text-center">
              <div className="font-mono font-bold text-zinc-200 text-sm">
                {ranked ? <>{ranked.leaguePoints}<span className="text-zinc-600 text-xs ml-0.5">lp</span></> : "—"}
              </div>
              <div className="text-zinc-600 text-[10px] uppercase tracking-wider">LP</div>
            </div>
            {/* Winrate */}
            <div className="text-center">
              <div className={`font-mono font-bold text-sm ${wr !== null ? (wr >= 50 ? "text-emerald-400" : "text-red-400") : "text-zinc-600"}`}>
                {wr !== null ? `${wr.toFixed(1)}%` : "—"}
              </div>
              <div className="text-zinc-600 text-[10px] uppercase tracking-wider">WR</div>
            </div>
            {/* W/L */}
            <div className="text-center">
              <div className="font-mono text-xs whitespace-nowrap">
                {ranked ? (
                  <>
                    <span className="text-emerald-400">{ranked.wins}W</span>
                    <span className="text-zinc-600 mx-0.5">/</span>
                    <span className="text-red-400">{ranked.losses}L</span>
                  </>
                ) : <span className="text-zinc-600">—</span>}
              </div>
              <div className="text-zinc-600 text-[10px] uppercase tracking-wider">W / L</div>
            </div>
          </div>

          {/* last 5 */}
          <MatchDots matches={player.lastMatches} />
        </div>
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function LeaderboardTable({ players, ddVersion }: { players: Player[]; ddVersion: string }) {
  return (
    <>
      {/* ── Mobile: cards ── */}
      <div className="flex flex-col gap-3 sm:hidden">
        {players.map((player, i) => (
          <PlayerCard key={player.riotId} player={player} pos={i} ddVersion={ddVersion} />
        ))}
      </div>

      {/* ── Desktop: table ── */}
      <div className="hidden sm:block rounded-2xl border border-white/5 overflow-hidden bg-white/[0.03] backdrop-blur-sm">
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
                <th className={`${TH} text-right`}>Últimas partidas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {players.map((player, i) => {
                const ranked = player.ranked;
                const wr = ranked ? winrate(ranked.wins, ranked.losses) : null;
                const borderClass = RANK_BORDER[i] ?? "";
                const numColor = RANK_NUM_COLOR[i] ?? "text-zinc-600";

                return (
                  <tr key={player.riotId}
                    className={`transition-all hover:brightness-75 ${borderClass}`}
                    style={rowBackground(player.topChampionName)}
                  >
                    <td className="px-4 py-5">
                      <span className={`text-sm font-black tabular-nums ${numColor}`}>{i + 1}</span>
                    </td>
                    <td className="px-4 py-5">
                      <div className="flex items-center gap-3">
                        <ProfileIcon iconId={player.profileIconId} ddVersion={ddVersion} size={36} />
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-semibold ${player.error ? "text-zinc-600 italic" : "text-zinc-100"}`}>
                            {player.gameName}
                          </span>
                          <span className="text-zinc-500 text-xs">#{player.tagLine}</span>
                          {ranked?.hotStreak && <span title="Racha ganadora" className="text-base leading-none">🔥</span>}
                          {player.live && (
                            <LiveBadge gameStartTime={player.live.gameStartTime} gameName={player.gameName} tagLine={player.tagLine} />
                          )}
                        </div>
                        {player.topChampionName && (
                          <span className="text-zinc-600 text-xs">{player.topChampionName}</span>
                        )}
                      </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="flex justify-center">
                        {ranked ? <TierIcon tier={ranked.tier} /> : <span className="text-zinc-600 text-xs">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-5 text-center text-zinc-400 font-mono">
                      {ranked && !NO_DIVISION_TIERS.has(ranked.tier) ? ranked.rank : "—"}
                    </td>
                    <td className="px-4 py-5 text-right font-mono font-semibold text-zinc-200">
                      {ranked ? <>{ranked.leaguePoints}<span className="text-zinc-600 text-xs ml-0.5">lp</span></> : "—"}
                    </td>
                    <td className="px-4 py-5 text-right font-mono text-xs whitespace-nowrap">
                      {ranked ? (
                        <>
                          <span className="text-emerald-400">{ranked.wins}W</span>
                          <span className="text-zinc-600 mx-1">/</span>
                          <span className="text-red-400">{ranked.losses}L</span>
                        </>
                      ) : <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="px-4 py-5 text-right font-mono font-bold">
                      {wr !== null ? (
                        <span className={wr >= 50 ? "text-emerald-400" : "text-red-400"}>{wr.toFixed(1)}%</span>
                      ) : <span className="text-zinc-600">—</span>}
                    </td>
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
    </>
  );
}

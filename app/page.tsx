export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { FRIENDS } from "@/config/friends";
import { fetchAllPlayers } from "@/lib/riot";
import { compareRank } from "@/lib/ranking";
import LeaderboardTable from "@/components/leaderboard-table";
import AutoRefresh from "@/components/auto-refresh";
import PositionChart from "@/components/position-chart";
import { kv } from "@vercel/kv";

async function getDDragonVersion(): Promise<string> {
  try {
    const res = await fetch("https://ddragon.leagueoflegends.com/api/versions.json", {
      next: { revalidate: 86400 },
    });
    const versions: string[] = await res.json();
    return versions[0];
  } catch {
    return "15.1.1";
  }
}

function TableSkeleton() {
  return (
    <div className="space-y-10">
      {/* Table skeleton */}
      <div className="rounded-2xl border border-white/5 overflow-hidden bg-white/[0.03] backdrop-blur-sm">
        {/* Header row */}
        <div className="hidden sm:grid grid-cols-8 gap-4 px-4 py-3 border-b border-white/5 bg-white/[0.03]">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-3 rounded bg-white/5 animate-pulse" />
          ))}
        </div>
        {/* Player rows */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-5 border-b border-white/[0.04] last:border-0">
            <div className="w-6 h-4 rounded bg-white/5 animate-pulse shrink-0" />
            <div className="w-9 h-9 rounded-full bg-white/5 animate-pulse shrink-0" />
            <div className="w-9 h-9 rounded-full bg-white/5 animate-pulse shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-32 rounded bg-white/5 animate-pulse" />
              <div className="h-2 w-20 rounded bg-white/[0.03] animate-pulse" />
            </div>
            <div className="hidden sm:flex gap-8">
              <div className="h-3 w-12 rounded bg-white/5 animate-pulse" />
              <div className="h-3 w-16 rounded bg-white/5 animate-pulse" />
              <div className="h-3 w-10 rounded bg-white/5 animate-pulse" />
              <div className="flex gap-1">
                {Array.from({ length: 5 }).map((_, j) => (
                  <div key={j} className="w-3 h-3 rounded-sm bg-white/5 animate-pulse" />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Chart skeleton */}
      <div className="rounded-2xl border border-white/5 bg-white/[0.03] backdrop-blur-sm p-5 space-y-3">
        <div className="h-3 w-40 rounded bg-white/5 animate-pulse" />
        <div className="h-48 rounded-xl bg-white/[0.02] animate-pulse" />
      </div>
    </div>
  );
}

async function LeaderboardSection({
  ddVersion,
  positionChanges,
}: {
  ddVersion: string;
  positionChanges: Record<string, number>;
}) {
  const players = await fetchAllPlayers(FRIENDS);
  players.sort(compareRank);

  return (
    <>
      <LeaderboardTable players={players} ddVersion={ddVersion} positionChanges={positionChanges} />
      <div className="rounded-2xl border border-white/5 bg-white/[0.03] backdrop-blur-sm p-5 space-y-3">
        <h2 className="text-xs font-semibold tracking-[0.25em] uppercase text-zinc-500">
          Historial de posiciones
        </h2>
        <PositionChart players={players} />
      </div>
    </>
  );
}

export default async function Home() {
  const [ddVersion, positionChanges] = await Promise.all([
    getDDragonVersion(),
    kv.get<Record<string, number>>("leaderboard:position-changes").catch(() => null),
  ]);

  return (
    <main className="min-h-screen bg-[#07070f] text-zinc-100 px-4 py-8 sm:py-12 relative overflow-hidden">
      {/* background glow blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full bg-purple-900/20 blur-[120px]" />
        <div className="absolute top-1/2 -left-40 w-[400px] h-[400px] rounded-full bg-amber-900/10 blur-[100px]" />
        <div className="absolute bottom-0 right-0 w-[350px] h-[350px] rounded-full bg-blue-900/10 blur-[100px]" />
      </div>

      <div className="relative max-w-4xl mx-auto space-y-10">
        {/* header */}
        <div className="text-center space-y-3">
          <h1 className="flex flex-col sm:flex-row sm:items-baseline sm:justify-center sm:gap-4 font-black tracking-tight leading-none">
            <span
              className="text-5xl sm:text-6xl"
              style={{
                background: "linear-gradient(135deg, #f5c542 0%, #e8a020 40%, #ffffff 70%, #c89b3c 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              TOMOCHOS
            </span>
            <span className="text-3xl sm:text-4xl text-zinc-300 font-extrabold tracking-[0.15em]">
              LEADERBOARD
            </span>
          </h1>

          {/* decorative divider */}
          <div className="flex items-center justify-center gap-3">
            <div className="h-px w-24 bg-gradient-to-r from-transparent to-amber-500/60" />
            <div className="w-1.5 h-1.5 rotate-45 bg-amber-500" />
            <div className="h-px w-24 bg-gradient-to-l from-transparent to-amber-500/60" />
          </div>

          <div className="flex items-center justify-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <AutoRefresh />
            </div>
          </div>
        </div>

        <Suspense fallback={<TableSkeleton />}>
          <LeaderboardSection
            ddVersion={ddVersion}
            positionChanges={positionChanges ?? {}}
          />
        </Suspense>

        <p className="text-center text-zinc-700 text-xs">
          Datos obtenidos de la Riot API · No afiliado con Riot Games
        </p>
      </div>
    </main>
  );
}

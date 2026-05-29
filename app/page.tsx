import { FRIENDS } from "@/config/friends";
import { fetchAllPlayers } from "@/lib/riot";
import { compareRank } from "@/lib/ranking";
import LeaderboardTable from "@/components/leaderboard-table";
import AutoRefresh from "@/components/auto-refresh";
import { kv } from "@vercel/kv";
import Link from "next/link";

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

export default async function Home() {
  const [players, ddVersion, positionChanges] = await Promise.all([
    fetchAllPlayers(FRIENDS),
    getDDragonVersion(),
    kv.get<Record<string, number>>("leaderboard:position-changes").catch(() => null),
  ]);
  players.sort(compareRank);

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
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Tomochos" className="w-20 h-20 sm:w-24 sm:h-24 object-contain rounded-full" />
          </div>

          <p className="text-xs font-semibold tracking-[0.3em] uppercase text-amber-500/80">
            LAS · SoloQ Ranking
          </p>

          <h1 className="text-5xl sm:text-7xl font-black tracking-tighter leading-none">
            <span
              className="block"
              style={{
                background: "linear-gradient(135deg, #f5c542 0%, #e8a020 40%, #ffffff 70%, #c89b3c 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              TOMOCHOS
            </span>
            <span className="block text-zinc-300 text-3xl sm:text-5xl font-extrabold tracking-[0.15em] mt-1">
              LEADERBOARD
            </span>
          </h1>

          {/* decorative divider */}
          <div className="flex items-center justify-center gap-3 pt-2">
            <div className="h-px w-24 bg-gradient-to-r from-transparent to-amber-500/60" />
            <div className="w-1.5 h-1.5 rotate-45 bg-amber-500" />
            <div className="h-px w-24 bg-gradient-to-l from-transparent to-amber-500/60" />
          </div>

          <div className="flex items-center justify-center gap-2 pt-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <AutoRefresh />
          </div>

          {/* evento especial */}
          <div className="pt-2">
            <Link
              href="/estreno"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold tracking-widest uppercase border border-purple-500/30 text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 transition-colors"
            >
              <span className="animate-pulse">🎬</span>
              Estreno Oficial
            </Link>
          </div>
        </div>

        <LeaderboardTable players={players} ddVersion={ddVersion} positionChanges={positionChanges ?? {}} />

        <p className="text-center text-zinc-700 text-xs">
          Datos obtenidos de la Riot API · No afiliado con Riot Games
        </p>
      </div>
    </main>
  );
}

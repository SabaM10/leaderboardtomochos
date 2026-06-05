import type { Metadata } from "next";
import EstrenoCountdown from "@/components/estreno-countdown";
import { DATE_CONFIRMED, ESTRENO_DATE, YOUTUBE_ID } from "@/config/estreno";

export const metadata: Metadata = {
  title: "Estreno Oficial · LA UNIÓN HACE LA FUERZA",
  description: "Un evento especial de Tomochos.",
};

export default function EstrenoPage() {
  const released = DATE_CONFIRMED && Date.now() >= ESTRENO_DATE.getTime();

  return (
    <main className="min-h-screen bg-[#07070f] text-zinc-100 px-4 py-12 flex flex-col items-center relative overflow-hidden">

      {/* background glows */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-purple-900/25 blur-[140px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[300px] rounded-full bg-amber-900/10 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-3xl flex flex-col items-center gap-8">

        {/* badge */}
        <span className="px-4 py-1.5 rounded-full text-[11px] font-bold tracking-[0.3em] uppercase border border-purple-500/30 text-purple-400 bg-purple-500/10">
          {released ? "🎬 Estreno Oficial" : "⏳ Próximamente"}
        </span>

        {/* title */}
        <div className="text-center space-y-2">
          <h1
            className="text-4xl sm:text-6xl font-black tracking-tight leading-tight"
            style={{
              background: "linear-gradient(135deg, #f5c542 0%, #e8a020 35%, #ffffff 65%, #c89b3c 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            LA UNIÓN HACE
          </h1>
          <h1
            className="text-4xl sm:text-6xl font-black tracking-tight leading-tight"
            style={{
              background: "linear-gradient(135deg, #f5c542 0%, #e8a020 35%, #ffffff 65%, #c89b3c 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            LA FUERZA
          </h1>
        </div>

        {/* divider */}
        <div className="flex items-center gap-3">
          <div className="h-px w-20 bg-gradient-to-r from-transparent to-amber-500/50" />
          <div className="w-1.5 h-1.5 rotate-45 bg-amber-500" />
          <div className="h-px w-20 bg-gradient-to-l from-transparent to-amber-500/50" />
        </div>

        {/* estreno date — solo si está confirmada */}
        {DATE_CONFIRMED && !released && (
          <p className="text-zinc-500 text-sm">
            {ESTRENO_DATE.toLocaleDateString("es", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "America/Argentina/Buenos_Aires",
            })}
          </p>
        )}

        {/* countdown / video / teaser */}
        <EstrenoCountdown />

      </div>
    </main>
  );
}

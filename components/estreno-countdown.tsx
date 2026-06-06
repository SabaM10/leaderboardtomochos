import Link from "next/link";
import { DATE_CONFIRMED, ESTRENO_DATE, YOUTUBE_ID } from "@/config/estreno";

function PulsingDots() {
  return (
    <div className="flex gap-2 items-center justify-center">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-purple-500/60"
          style={{ animation: `pulse 1.5s ease-in-out ${i * 0.3}s infinite` }}
        />
      ))}
    </div>
  );
}

export default function EstrenoCountdown() {
  const released = YOUTUBE_ID.length > 0 || (DATE_CONFIRMED && Date.now() >= ESTRENO_DATE.getTime());
  const hasVideo = YOUTUBE_ID.length > 0;

  return (
    <div className="flex flex-col items-center gap-10 w-full">

      {/* teaser críptico — sin fecha confirmada */}
      {!DATE_CONFIRMED && (
        <div className="flex flex-col items-center gap-6 py-8">
          <PulsingDots />
          <p className="text-zinc-300 text-lg italic text-center">
            &ldquo;Los tiempos de dios son perfectos&rdquo;
          </p>
        </div>
      )}


      {/* video — estrenado */}
      {released && (
        <div className="w-full flex flex-col items-center gap-6 animate-fadeIn">
          {hasVideo ? (
            <div className="w-full max-w-3xl aspect-video rounded-2xl overflow-hidden shadow-2xl"
              style={{ boxShadow: "0 0 80px rgba(180,80,220,0.25)" }}>
              <iframe
                className="w-full h-full"
                src={`https://www.youtube.com/embed/${YOUTUBE_ID}?autoplay=1&rel=0`}
                title="LA UNIÓN HACE LA FUERZA"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-16">
              <span className="text-5xl">🎬</span>
              <p className="text-zinc-400 text-lg font-semibold">El video estará disponible en breve</p>
            </div>
          )}
        </div>
      )}

      <Link
        href="/"
        className="text-zinc-700 hover:text-zinc-400 text-xs tracking-widest uppercase transition-colors"
      >
        ← Volver al Leaderboard
      </Link>
    </div>
  );
}

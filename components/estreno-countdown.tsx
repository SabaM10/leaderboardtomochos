"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// ── CONFIGURACIÓN ──────────────────────────────────────────────────────────────
// Cambia estos dos valores cuando los tengas:
export const ESTRENO_DATE = new Date("2026-06-15T21:00:00-03:00"); // fecha/hora de estreno (ART)
export const YOUTUBE_ID = ""; // ej: "dQw4w9WgXcQ" (solo el ID, no la URL completa)
// ──────────────────────────────────────────────────────────────────────────────

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
}

function getTimeLeft(): TimeLeft {
  const total = ESTRENO_DATE.getTime() - Date.now();
  if (total <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 };
  return {
    total,
    days: Math.floor(total / (1000 * 60 * 60 * 24)),
    hours: Math.floor((total / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((total / (1000 * 60)) % 60),
    seconds: Math.floor((total / 1000) % 60),
  };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export default function EstrenoCountdown() {
  const [time, setTime] = useState<TimeLeft | null>(null);

  useEffect(() => {
    setTime(getTimeLeft());
    const id = setInterval(() => setTime(getTimeLeft()), 1000);
    return () => clearInterval(id);
  }, []);

  const released = time !== null && time.total <= 0;
  const hasVideo = YOUTUBE_ID.length > 0;

  return (
    <div className="flex flex-col items-center gap-10 w-full">

      {!released && (
        <>
          {/* countdown */}
          <div className="flex gap-4 sm:gap-8">
            {[
              { label: "DÍAS",     value: time?.days ?? 0 },
              { label: "HORAS",    value: time?.hours ?? 0 },
              { label: "MINUTOS",  value: time?.minutes ?? 0 },
              { label: "SEGUNDOS", value: time?.seconds ?? 0 },
            ].map(({ label, value }) => (
              <div key={label} className="flex flex-col items-center gap-1">
                <div
                  className="w-20 sm:w-28 h-20 sm:h-28 rounded-2xl flex items-center justify-center text-4xl sm:text-6xl font-black tabular-nums"
                  style={{
                    background: "linear-gradient(145deg, #1a1a2e 0%, #12121f 100%)",
                    boxShadow: "0 0 30px rgba(180,80,220,0.15), inset 0 1px 0 rgba(255,255,255,0.05)",
                    border: "1px solid rgba(180,80,220,0.2)",
                    color: "#e8e8f8",
                  }}
                >
                  {time === null ? "--" : pad(value)}
                </div>
                <span className="text-[10px] sm:text-xs font-bold tracking-[0.25em] text-zinc-600">
                  {label}
                </span>
              </div>
            ))}
          </div>

          <p className="text-zinc-600 text-xs tracking-widest uppercase">
            Quedate atento
          </p>
        </>
      )}

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

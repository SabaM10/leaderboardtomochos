"use client";

import { useEffect, useState, useRef } from "react";
import { Player } from "@/lib/types";

const PLAYER_COLORS = [
  "#ffd700", "#ff6b6b", "#4ecdc4", "#a78bfa",
  "#34d399", "#fb923c", "#60a5fa", "#f472b6", "#a3e635",
];

const PAD = { top: 16, right: 100, bottom: 28, left: 28 };
const CHART_W = 600;
const CHART_H = 320;
const PLOT_W = CHART_W - PAD.left - PAD.right;
const PLOT_H = CHART_H - PAD.top - PAD.bottom;

type PosHistory = Record<string, { t: number; pos: number }[]>;
type Range = "7D" | "1M" | "All";

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString("es", { day: "numeric", month: "short" });
}

interface TooltipData {
  x: number;
  y: number;
  gameName: string;
  pos: number;
  ts: number;
  color: string;
}

export default function PositionChart({ players }: { players: Player[] }) {
  const [history, setHistory] = useState<PosHistory | null>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [range, setRange] = useState<Range>("All");
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    fetch("/api/position-history")
      .then((r) => r.json())
      .then(setHistory)
      .catch(() => setHistory({}));
  }, []);

  if (!history) {
    return (
      <div className="flex items-center justify-center py-8 gap-2 text-zinc-600 text-sm">
        <span className="w-3 h-3 rounded-full border-2 border-zinc-700 border-t-zinc-400 animate-spin" />
        Cargando historial...
      </div>
    );
  }

  const rangeCutoff = range === "All" ? 0 : Date.now() - (range === "7D" ? 7 : 30) * 86400_000;

  // Build sorted list of players that have history
  const entries = players
    .map((p, colorIdx) => {
      const sorted = (history[p.riotId] ?? []).sort((a, b) => a.t - b.t);
      // Keep one anchor point before the cutoff so lines start at the edge
      const filtered = sorted.filter((d) => d.t >= rangeCutoff);
      const anchor = sorted.filter((d) => d.t < rangeCutoff).at(-1);
      const data = anchor ? [anchor, ...filtered] : filtered;
      return {
        player: p,
        color: PLAYER_COLORS[colorIdx % PLAYER_COLORS.length],
        data,
      };
    })
    .filter((e) => e.data.length >= 2);

  if (entries.length === 0) {
    return (
      <p className="text-zinc-600 text-sm text-center py-6">
        Los datos se acumularán a partir de la próxima corrida del cron.
      </p>
    );
  }

  const allTs = entries.flatMap((e) => e.data.map((d) => d.t));
  const minTs = Math.min(...allTs);
  const maxTs = Math.max(...allTs);
  const maxPos = Math.max(...entries.flatMap((e) => e.data.map((d) => d.pos))) + 1;

  const sx = (t: number) => PAD.left + ((t - minTs) / (maxTs - minTs || 1)) * PLOT_W;
  // pos 0 = top, pos N = bottom
  const sy = (pos: number) => PAD.top + (pos / (maxPos || 1)) * PLOT_H;

  // X ticks
  const xTickCount = Math.min(5, entries[0]?.data.length ?? 1);
  const xTicks: number[] = [];
  for (let i = 0; i < xTickCount; i++) {
    xTicks.push(minTs + (i / (xTickCount - 1 || 1)) * (maxTs - minTs));
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) * (CHART_W / rect.width);
    const mouseY = (e.clientY - rect.top) * (CHART_H / rect.height);

    let best: TooltipData | null = null;
    let bestDist = Infinity;

    for (const entry of entries) {
      for (const d of entry.data) {
        const px = sx(d.t);
        const py = sy(d.pos);
        const dist = Math.hypot(px - mouseX, py - mouseY);
        if (dist < bestDist && dist < 20) {
          bestDist = dist;
          best = {
            x: px, y: py,
            gameName: entry.player.gameName,
            pos: d.pos + 1,
            ts: d.t,
            color: entry.color,
          };
        }
      }
    }
    setTooltip(best);
  }

  const ranges: Range[] = ["7D", "1M", "All"];

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 justify-end">
        {ranges.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-3 py-1 text-xs rounded-lg font-semibold transition-colors ${
              range === r
                ? "bg-white/10 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

    <div className="relative w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="w-full"
        style={{ height: CHART_H }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      >
        <defs>
          <clipPath id="posClip">
            <rect x={PAD.left} y={PAD.top} width={PLOT_W} height={PLOT_H} />
          </clipPath>
        </defs>

        {/* Horizontal grid lines per position */}
        {Array.from({ length: maxPos + 1 }, (_, i) => (
          <line
            key={i}
            x1={PAD.left} y1={sy(i)}
            x2={PAD.left + PLOT_W} y2={sy(i)}
            stroke="rgba(255,255,255,0.04)"
            strokeWidth="1"
          />
        ))}

        {/* Lines per player */}
        {entries.map(({ player, color, data }) => {
          const path = data
            .map((d, i) => `${i === 0 ? "M" : "L"} ${sx(d.t).toFixed(1)} ${sy(d.pos).toFixed(1)}`)
            .join(" ");
          return (
            <path
              key={player.riotId}
              d={path}
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeOpacity="0.85"
              clipPath="url(#posClip)"
            />
          );
        })}

        {/* Dots at last known position */}
        {entries.map(({ player, color, data }) => {
          const last = data[data.length - 1];
          return (
            <circle
              key={player.riotId}
              cx={sx(last.t)}
              cy={sy(last.pos)}
              r="3.5"
              fill={color}
              stroke="#07070f"
              strokeWidth="1.5"
            />
          );
        })}

        {/* Player name labels on right */}
        {entries.map(({ player, color, data }) => {
          const last = data[data.length - 1];
          return (
            <text
              key={player.riotId}
              x={PAD.left + PLOT_W + 6}
              y={sy(last.pos) + 4}
              fontSize="9"
              fill={color}
              fontWeight="600"
            >
              {player.gameName}
            </text>
          );
        })}

        {/* X axis ticks */}
        {xTicks.map((ts, i) => (
          <text
            key={i}
            x={sx(ts)}
            y={PAD.top + PLOT_H + 14}
            textAnchor="middle"
            fontSize="9"
            fill="#3f3f5a"
          >
            {fmtDate(ts)}
          </text>
        ))}

        {/* Tooltip highlight dot */}
        {tooltip && (
          <circle
            cx={tooltip.x}
            cy={tooltip.y}
            r="5"
            fill={tooltip.color}
            stroke="#fff"
            strokeWidth="1.5"
          />
        )}
      </svg>

      {/* Floating tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none absolute bg-[#13131f] border border-white/10 rounded-lg px-3 py-2 text-xs shadow-xl z-10"
          style={{
            left: `${(tooltip.x / CHART_W) * 100}%`,
            top: `${(tooltip.y / CHART_H) * 100}%`,
            transform: tooltip.x > CHART_W * 0.65 ? "translate(-110%, -120%)" : "translate(10%, -120%)",
          }}
        >
          <div className="font-semibold" style={{ color: tooltip.color }}>
            {tooltip.gameName}
          </div>
          <div className="text-zinc-300 mt-0.5">Posición #{tooltip.pos}</div>
          <div className="text-zinc-500 mt-0.5">{fmtDate(tooltip.ts)}</div>
        </div>
      )}
    </div>
    </div>
  );
}

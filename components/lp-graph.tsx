"use client";

import { useState, useEffect, useRef } from "react";
import { LpSnapshot, Player, Tier, Division } from "@/lib/types";

// ─── constants ───────────────────────────────────────────────────────────────

const TIER_BANDS: { tier: string; base: number; color: string; label: string }[] = [
  { tier: "CHALLENGER",  base: 3000, color: "rgba(255,215,0,0.08)",   label: "Challenger" },
  { tier: "GRANDMASTER", base: 2900, color: "rgba(255,80,80,0.08)",   label: "Grandmaster" },
  { tier: "MASTER",      base: 2800, color: "rgba(180,80,220,0.08)",  label: "Master" },
  { tier: "DIAMOND",     base: 2400, color: "rgba(85,165,255,0.08)",  label: "Diamond" },
  { tier: "EMERALD",     base: 2000, color: "rgba(0,200,140,0.08)",   label: "Emerald" },
  { tier: "PLATINUM",    base: 1600, color: "rgba(80,200,180,0.08)",  label: "Platinum" },
  { tier: "GOLD",        base: 1200, color: "rgba(255,185,0,0.08)",   label: "Gold" },
  { tier: "SILVER",      base: 800,  color: "rgba(180,180,200,0.08)", label: "Silver" },
  { tier: "BRONZE",      base: 400,  color: "rgba(180,100,40,0.08)",  label: "Bronze" },
  { tier: "IRON",        base: 0,    color: "rgba(120,100,80,0.08)",  label: "Iron" },
];

const TIER_COLORS: Record<string, string> = {
  CHALLENGER:  "#ffd700", GRANDMASTER: "#ff5050", MASTER: "#b450dc",
  DIAMOND:     "#55a5ff", EMERALD:     "#00c88c", PLATINUM:   "#50c8b4",
  GOLD:        "#ffb900", SILVER:      "#b4b4c8", BRONZE:     "#b46428",
  IRON:        "#786450",
};

const PAD = { top: 16, right: 12, bottom: 32, left: 56 };
const CHART_W = 500;
const CHART_H = 200;
const PLOT_W = CHART_W - PAD.left - PAD.right;
const PLOT_H = CHART_H - PAD.top - PAD.bottom;

const RANK_LABEL: Record<Division, string> = { I: "I", II: "II", III: "III", IV: "IV" };

// ─── helpers ─────────────────────────────────────────────────────────────────

function toDisplayLp(tier: string, rank: string | null, lp: number): number {
  const tierBase: Record<string, number> = {
    IRON: 0, BRONZE: 400, SILVER: 800, GOLD: 1200, PLATINUM: 1600,
    EMERALD: 2000, DIAMOND: 2400, MASTER: 2800, GRANDMASTER: 2900, CHALLENGER: 3000,
  };
  const rankAdd: Record<string, number> = { IV: 0, III: 100, II: 200, I: 300 };
  return (tierBase[tier] ?? 0) + (rank ? (rankAdd[rank] ?? 0) : 0) + Math.min(lp, 100);
}

function fromDisplayLp(score: number): { tier: Tier; rank: Division | null; lp: number } {
  const tiers = [
    { tier: "CHALLENGER" as Tier, base: 3000, noDivision: true },
    { tier: "GRANDMASTER" as Tier, base: 2900, noDivision: true },
    { tier: "MASTER" as Tier, base: 2800, noDivision: true },
    { tier: "DIAMOND" as Tier, base: 2400, noDivision: false },
    { tier: "EMERALD" as Tier, base: 2000, noDivision: false },
    { tier: "PLATINUM" as Tier, base: 1600, noDivision: false },
    { tier: "GOLD" as Tier, base: 1200, noDivision: false },
    { tier: "SILVER" as Tier, base: 800, noDivision: false },
    { tier: "BRONZE" as Tier, base: 400, noDivision: false },
    { tier: "IRON" as Tier, base: 0, noDivision: false },
  ];
  const clamped = Math.max(0, score);
  for (const { tier, base, noDivision } of tiers) {
    if (clamped >= base) {
      if (noDivision) return { tier, rank: null, lp: Math.min(clamped - base, 999) };
      const rem = clamped - base;
      const divIdx = Math.min(Math.floor(rem / 100), 3);
      return { tier, rank: (["IV", "III", "II", "I"] as Division[])[divIdx], lp: rem % 100 };
    }
  }
  return { tier: "IRON", rank: "IV", lp: 0 };
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString("es", { day: "numeric", month: "short" });
}

// ─── chart ───────────────────────────────────────────────────────────────────

function LpChart({ snapshots }: { snapshots: LpSnapshot[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{
    x: number; y: number; snap: LpSnapshot
  } | null>(null);

  if (snapshots.length < 2) {
    return <p className="text-zinc-600 text-sm text-center py-8">No hay suficientes datos</p>;
  }

  const scores = snapshots.map((s) => s.score);
  const times = snapshots.map((s) => s.timestamp);
  const minScore = Math.max(0, Math.min(...scores) - 80);
  const maxScore = Math.max(...scores) + 80;
  const minTs = Math.min(...times);
  const maxTs = Math.max(...times);

  const sx = (ts: number) =>
    PAD.left + ((ts - minTs) / (maxTs - minTs || 1)) * PLOT_W;
  const sy = (score: number) =>
    PAD.top + PLOT_H - ((score - minScore) / (maxScore - minScore || 1)) * PLOT_H;

  const linePath = snapshots
    .map((s, i) => `${i === 0 ? "M" : "L"} ${sx(s.timestamp).toFixed(1)} ${sy(s.score).toFixed(1)}`)
    .join(" ");

  const areaPath =
    linePath +
    ` L ${sx(snapshots[snapshots.length - 1].timestamp).toFixed(1)} ${(PAD.top + PLOT_H).toFixed(1)}` +
    ` L ${sx(snapshots[0].timestamp).toFixed(1)} ${(PAD.top + PLOT_H).toFixed(1)} Z`;

  // Visible tier bands within score range
  const visibleBands = TIER_BANDS.filter(
    (b, idx) =>
      b.base >= minScore ||
      (idx < TIER_BANDS.length - 1 && TIER_BANDS[idx + 1].base <= maxScore) ||
      (b.base <= maxScore && (idx === TIER_BANDS.length - 1 || TIER_BANDS[idx + 1].base > minScore))
  );

  // Y axis tick labels (tier boundaries visible in range)
  const yTicks = TIER_BANDS.filter(
    (b) => b.base >= minScore && b.base <= maxScore
  );

  // X axis ticks: up to 5 evenly spaced dates
  const xTickCount = Math.min(5, snapshots.length);
  const xTicks: LpSnapshot[] = [];
  for (let i = 0; i < xTickCount; i++) {
    const idx = Math.round((i / (xTickCount - 1)) * (snapshots.length - 1));
    xTicks.push(snapshots[idx]);
  }

  // Line color based on net trend
  const netChange = snapshots[snapshots.length - 1].score - snapshots[0].score;
  const lineColor = netChange >= 0 ? "#34d399" : "#f87171";

  // Hover — find nearest x point
  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) * (CHART_W / rect.width);
    let nearest = snapshots[0];
    let minDist = Infinity;
    for (const s of snapshots) {
      const d = Math.abs(sx(s.timestamp) - mouseX);
      if (d < minDist) { minDist = d; nearest = s; }
    }
    setTooltip({ x: sx(nearest.timestamp), y: sy(nearest.score), snap: nearest });
  }

  return (
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
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
          </linearGradient>
          <clipPath id="chartClip">
            <rect x={PAD.left} y={PAD.top} width={PLOT_W} height={PLOT_H} />
          </clipPath>
        </defs>

        {/* tier bands */}
        {visibleBands.map((band, idx) => {
          const nextBase =
            idx === 0 ? maxScore + 200 : visibleBands[idx - 1].base;
          const yTop = sy(Math.min(nextBase, maxScore + 80));
          const yBot = sy(Math.max(band.base, minScore - 80));
          return (
            <rect
              key={band.tier}
              x={PAD.left}
              y={yTop}
              width={PLOT_W}
              height={Math.max(0, yBot - yTop)}
              fill={band.color}
              clipPath="url(#chartClip)"
            />
          );
        })}

        {/* horizontal grid + tier labels */}
        {yTicks.map((t) => (
          <g key={t.tier}>
            <line
              x1={PAD.left}
              y1={sy(t.base)}
              x2={PAD.left + PLOT_W}
              y2={sy(t.base)}
              stroke="rgba(255,255,255,0.07)"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 6}
              y={sy(t.base) + 4}
              textAnchor="end"
              fontSize="9"
              fill={TIER_COLORS[t.tier] ?? "#888"}
              fontWeight="600"
            >
              {t.label}
            </text>
          </g>
        ))}

        {/* x axis ticks */}
        {xTicks.map((s, i) => (
          <text
            key={i}
            x={sx(s.timestamp)}
            y={PAD.top + PLOT_H + 14}
            textAnchor="middle"
            fontSize="9"
            fill="#52525b"
          >
            {fmtDate(s.timestamp)}
          </text>
        ))}

        {/* area fill */}
        <path d={areaPath} fill="url(#areaGrad)" clipPath="url(#chartClip)" />

        {/* line */}
        <path
          d={linePath}
          fill="none"
          stroke={lineColor}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          clipPath="url(#chartClip)"
        />

        {/* dots */}
        {snapshots.map((s, i) => (
          <circle
            key={i}
            cx={sx(s.timestamp)}
            cy={sy(s.score)}
            r="3"
            fill={s.approximate ? "#3f3f5a" : lineColor}
            stroke={lineColor}
            strokeWidth="1.5"
            clipPath="url(#chartClip)"
          />
        ))}

        {/* tooltip dot highlight */}
        {tooltip && (
          <circle
            cx={tooltip.x}
            cy={tooltip.y}
            r="5"
            fill={lineColor}
            stroke="#fff"
            strokeWidth="1.5"
          />
        )}
      </svg>

      {/* floating tooltip */}
      {tooltip && (() => {
        const { tier, rank, lp } = fromDisplayLp(tooltip.snap.score);
        const noDivision = ["CHALLENGER", "GRANDMASTER", "MASTER"].includes(tier);
        const rankStr = noDivision ? "" : ` ${rank ?? ""}`;
        const tierLabel = (TIER_BANDS.find((b) => b.tier === tier)?.label ?? tier);
        return (
          <div
            className="pointer-events-none absolute bg-[#13131f] border border-white/10 rounded-lg px-3 py-2 text-xs shadow-xl z-10"
            style={{
              left: `${(tooltip.x / CHART_W) * 100}%`,
              top: `${(tooltip.y / CHART_H) * 100}%`,
              transform: tooltip.x > CHART_W * 0.65
                ? "translate(-110%, -120%)"
                : "translate(10%, -120%)",
            }}
          >
            <div className="font-semibold" style={{ color: TIER_COLORS[tier] ?? "#888" }}>
              {tierLabel}{rankStr} · {lp} LP
            </div>
            <div className="text-zinc-500 mt-0.5">{fmtDate(tooltip.snap.timestamp)}</div>
            {tooltip.snap.approximate && (
              <div className="text-zinc-700 mt-0.5">estimado</div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ─── main export ─────────────────────────────────────────────────────────────

type Range = "7D" | "1M" | "All";

export default function LpGraph({ player }: { player: Player }) {
  const [snapshots, setSnapshots] = useState<LpSnapshot[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<Range>("All");

  useEffect(() => {
    if (!player.puuid || !player.ranked) return;
    setLoading(true);
    const { tier, rank, leaguePoints } = player.ranked;
    const url = `/api/lp-history/${encodeURIComponent(player.puuid)}?tier=${tier}&rank=${rank ?? ""}&lp=${leaguePoints}`;
    fetch(url)
      .then((r) => r.json())
      .then((data: LpSnapshot[]) => { setSnapshots(data); setLoading(false); })
      .catch(() => { setSnapshots([]); setLoading(false); });
  }, [player.puuid, player.ranked]);

  const filtered = (() => {
    if (!snapshots) return null;
    if (range === "All") return snapshots;
    const cutoff = Date.now() - (range === "7D" ? 7 : 30) * 86400 * 1000;
    const filtered = snapshots.filter((s) => s.timestamp >= cutoff);
    // Always include at least the first point before the cutoff as anchor
    if (filtered.length > 0 && filtered[0].timestamp > cutoff) {
      const before = snapshots.filter((s) => s.timestamp < cutoff).at(-1);
      if (before) filtered.unshift(before);
    }
    return filtered;
  })();

  const ranges: Range[] = ["7D", "1M", "All"];

  if (!player.ranked) {
    return <p className="text-zinc-600 text-sm text-center py-8">Sin datos de ranked</p>;
  }

  return (
    <div className="space-y-3">
      {/* range tabs */}
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

      {loading && (
        <div className="flex items-center justify-center py-10 gap-2 text-zinc-500 text-sm">
          <span className="w-3 h-3 rounded-full border-2 border-zinc-600 border-t-zinc-300 animate-spin" />
          Cargando historial...
        </div>
      )}

      {!loading && filtered !== null && <LpChart snapshots={filtered} />}

      {!loading && filtered !== null && (
        <p className="text-zinc-700 text-[10px] text-center">
          {filtered.some((s) => s.approximate)
            ? "Los puntos anteriores al día de hoy son estimados (±20 LP por partida)"
            : ""}
        </p>
      )}
    </div>
  );
}

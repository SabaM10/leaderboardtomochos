import { Tier, Division, TierCutoffs } from "@/lib/types";

const TIER_BASE: Record<string, number> = {
  IRON: 0, BRONZE: 400, SILVER: 800, GOLD: 1200, PLATINUM: 1600,
  EMERALD: 2000, DIAMOND: 2400, MASTER: 2800, GRANDMASTER: 2900, CHALLENGER: 3000,
};
const RANK_ADD: Record<string, number> = { IV: 0, III: 100, II: 200, I: 300 };
const APEX = ["MASTER", "GRANDMASTER", "CHALLENGER"];

/**
 * Convert tier/rank/LP to a linear display score (0–3100).
 * With cutoffs, Master/GM/Challenger are properly scaled within their real LP ranges.
 */
export function toDisplayLp(
  tier: string,
  rank: string | null,
  lp: number,
  cutoffs?: TierCutoffs
): number {
  const noDivision = APEX.includes(tier);

  if (noDivision && cutoffs) {
    const { gmMin, challMin } = cutoffs;
    if (tier === "MASTER") {
      return 2800 + Math.min(lp / Math.max(gmMin, 1), 1) * 100;
    }
    if (tier === "GRANDMASTER") {
      const span = Math.max(challMin - gmMin, 1);
      return 2900 + Math.min((lp - gmMin) / span, 1) * 100;
    }
    // CHALLENGER: scale by challMin as reference span
    return 3000 + Math.min((lp - challMin) / Math.max(challMin, 100), 1) * 100;
  }

  return (TIER_BASE[tier] ?? 0) +
    (!noDivision && rank ? (RANK_ADD[rank] ?? 0) : 0) +
    Math.min(lp, 100);
}

/** Inverse of toDisplayLp — used for tooltip labels. */
export function fromDisplayLp(
  score: number,
  cutoffs?: TierCutoffs
): { tier: Tier; rank: Division | null; lp: number } {
  const clamped = Math.max(0, score);

  if (cutoffs && clamped >= 2800) {
    const { gmMin, challMin } = cutoffs;
    if (clamped >= 3000) {
      const lp = Math.round(challMin + (clamped - 3000) * Math.max(challMin, 100) / 100);
      return { tier: "CHALLENGER", rank: null, lp };
    }
    if (clamped >= 2900) {
      const span = Math.max(challMin - gmMin, 1);
      const lp = Math.round(gmMin + (clamped - 2900) * span / 100);
      return { tier: "GRANDMASTER", rank: null, lp };
    }
    const lp = Math.round((clamped - 2800) * Math.max(gmMin, 1) / 100);
    return { tier: "MASTER", rank: null, lp };
  }

  const tiers: { tier: Tier; base: number; noDivision: boolean }[] = [
    { tier: "CHALLENGER", base: 3000, noDivision: true },
    { tier: "GRANDMASTER", base: 2900, noDivision: true },
    { tier: "MASTER", base: 2800, noDivision: true },
    { tier: "DIAMOND", base: 2400, noDivision: false },
    { tier: "EMERALD", base: 2000, noDivision: false },
    { tier: "PLATINUM", base: 1600, noDivision: false },
    { tier: "GOLD", base: 1200, noDivision: false },
    { tier: "SILVER", base: 800, noDivision: false },
    { tier: "BRONZE", base: 400, noDivision: false },
    { tier: "IRON", base: 0, noDivision: false },
  ];
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

import { Tier, Division, Player } from "@/lib/types";

export const TIER_WEIGHTS: Record<Tier, number> = {
  CHALLENGER: 10,
  GRANDMASTER: 9,
  MASTER: 8,
  DIAMOND: 7,
  EMERALD: 6,
  PLATINUM: 5,
  GOLD: 4,
  SILVER: 3,
  BRONZE: 2,
  IRON: 1,
  UNRANKED: 0,
};

const DIVISION_WEIGHTS: Record<Division, number> = {
  I: 4,
  II: 3,
  III: 2,
  IV: 1,
};

export function computeScore(
  tier: Tier,
  rank: Division | null,
  lp: number
): number {
  const tierWeight = TIER_WEIGHTS[tier] ?? 0;
  const divisionWeight = rank ? DIVISION_WEIGHTS[rank] ?? 0 : 0;
  return tierWeight * 10000 + divisionWeight * 1000 + lp;
}

export function compareRank(a: Player, b: Player): number {
  return b.score - a.score;
}

export function winrate(wins: number, losses: number): number {
  const total = wins + losses;
  if (total === 0) return 0;
  return Math.round((wins / total) * 10000) / 100;
}

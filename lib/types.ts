export type Tier =
  | "CHALLENGER"
  | "GRANDMASTER"
  | "MASTER"
  | "DIAMOND"
  | "EMERALD"
  | "PLATINUM"
  | "GOLD"
  | "SILVER"
  | "BRONZE"
  | "IRON"
  | "UNRANKED";

export type Division = "I" | "II" | "III" | "IV";

export interface RiotAccount {
  puuid: string;
  gameName: string;
  tagLine: string;
}

export interface LeagueEntryDTO {
  queueType: string;
  tier: Tier;
  rank: Division;
  leaguePoints: number;
  wins: number;
  losses: number;
  hotStreak: boolean;
  veteran: boolean;
  freshBlood: boolean;
  inactive: boolean;
}

export interface RankedInfo {
  tier: Tier;
  rank: Division;
  leaguePoints: number;
  wins: number;
  losses: number;
  hotStreak: boolean;
}

export interface LiveGame {
  gameStartTime: number; // epoch ms
  gameMode: string;
}

export interface MatchResult {
  win: boolean;
  championName: string;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  durationSecs: number;
}

export interface Player {
  riotId: string; // gameName#tagLine
  gameName: string;
  tagLine: string;
  puuid: string | null;
  ranked: RankedInfo | null;
  score: number;
  live: LiveGame | null;
  lastMatches: MatchResult[];
  topChampionName: string | null;
  profileIconId: number | null;
  error?: string;
}

export interface FriendConfig {
  gameName: string;
  tagLine: string;
}

export interface LpSnapshot {
  timestamp: number;
  score: number;      // toDisplayLp value used as chart Y axis
  approximate: boolean;
}

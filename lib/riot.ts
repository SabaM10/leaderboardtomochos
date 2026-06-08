import {
  RiotAccount, LeagueEntryDTO, RankedInfo,
  LiveGame, MatchResult, Player, FriendConfig, TierCutoffs,
} from "@/lib/types";
import { computeScore } from "@/lib/ranking";
import { kv } from "@vercel/kv";

const RIOT_API_KEY = process.env.RIOT_API_KEY!;
const REVALIDATE = 300;

const riotHeaders = { "X-Riot-Token": RIOT_API_KEY };

async function riotFetch(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, init);
    if (res.status !== 429) return res;
    const wait = parseInt(res.headers.get("Retry-After") ?? "2", 10);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
  return fetch(url, init);
}

// ---------- helpers ----------

async function getPuuid(gameName: string, tagLine: string): Promise<RiotAccount> {
  const cacheKey = `puuid:${gameName}#${tagLine}`;
  try {
    const cached = await kv.get<RiotAccount>(cacheKey);
    if (cached) return cached;
  } catch { /* KV unavailable in local dev */ }

  const url = `https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  const res = await riotFetch(url, { headers: riotHeaders, next: { revalidate: REVALIDATE } });
  if (!res.ok) throw new Error(`ACCOUNT-V1 ${res.status}: ${gameName}#${tagLine}`);
  const account: RiotAccount = await res.json();

  try {
    await kv.set(cacheKey, account);
  } catch { /* KV unavailable in local dev */ }

  return account;
}

async function getRankedInfo(puuid: string): Promise<RankedInfo | null> {
  const url = `https://la2.api.riotgames.com/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`;
  const res = await riotFetch(url, { headers: riotHeaders, next: { revalidate: REVALIDATE } });
  if (!res.ok) throw new Error(`LEAGUE-V4 ${res.status}`);

  const entries: LeagueEntryDTO[] = await res.json();
  const solo = entries.find((e) => e.queueType === "RANKED_SOLO_5x5");
  if (!solo) return null;

  return {
    tier: solo.tier,
    rank: solo.rank,
    leaguePoints: solo.leaguePoints,
    wins: solo.wins,
    losses: solo.losses,
    hotStreak: solo.hotStreak,
  };
}

async function getLiveGame(puuid: string): Promise<LiveGame | null> {
  const url = `https://la2.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${encodeURIComponent(puuid)}`;
  const res = await riotFetch(url, { headers: riotHeaders, next: { revalidate: 60 } });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const data = await res.json();
  console.log(`[LiveGame] queueId=${data.gameQueueConfigId} gameMode=${data.gameMode} gameType=${data.gameType}`);
  if (data.gameQueueConfigId !== 420) return null;
  return { gameStartTime: data.gameStartTime, gameMode: data.gameMode };
}

async function getChampionNameById(championId: number): Promise<string | null> {
  const verRes = await fetch("https://ddragon.leagueoflegends.com/api/versions.json", {
    next: { revalidate: 86400 },
  });
  if (!verRes.ok) return null;
  const versions: string[] = await verRes.json();
  const version = versions[0];

  const champRes = await fetch(
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`,
    { next: { revalidate: 86400 } }
  );
  if (!champRes.ok) return null;
  const champData = await champRes.json();

  const found = Object.values(
    champData.data as Record<string, { key: string; id: string }>
  ).find((c) => Number(c.key) === championId);

  return found?.id ?? null;
}

async function getProfileIconId(puuid: string): Promise<number | null> {
  const url = `https://la2.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(puuid)}`;
  const res = await riotFetch(url, { headers: riotHeaders, next: { revalidate: REVALIDATE } });
  if (!res.ok) return null;
  const data = await res.json();
  return data.profileIconId ?? null;
}

async function getTopChampion(puuid: string): Promise<string | null> {
  const url = `https://la2.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${encodeURIComponent(puuid)}/top?count=1`;
  const res = await riotFetch(url, { headers: riotHeaders, next: { revalidate: REVALIDATE } });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data[0]) return null;
  return getChampionNameById(data[0].championId);
}

export async function getLastMatches(puuid: string): Promise<MatchResult[]> {
  const cacheKey = `matches:${puuid}`;
  try {
    const cached = await kv.get<MatchResult[]>(cacheKey);
    if (cached) return cached;
  } catch { /* KV unavailable */ }

  const idsUrl = `https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?queue=420&count=5`;
  const idsRes = await riotFetch(idsUrl, { headers: riotHeaders, next: { revalidate: REVALIDATE } });
  if (!idsRes.ok) return [];

  const matchIds: string[] = await idsRes.json();
  const results: MatchResult[] = [];

  for (const matchId of matchIds) {
    const res = await riotFetch(
      `https://americas.api.riotgames.com/lol/match/v5/matches/${matchId}`,
      { headers: riotHeaders, next: { revalidate: REVALIDATE } }
    );
    if (!res.ok) continue;
    const data = await res.json();

    if (data.info.gameEndReason === "Abort_Remake") continue;

    const p = data.info.participants.find(
      (x: { puuid: string }) => x.puuid === puuid
    );
    if (!p) continue;
    results.push({
      win: p.win as boolean,
      championName: p.championName as string,
      kills: p.kills as number,
      deaths: p.deaths as number,
      assists: p.assists as number,
      cs: (p.totalMinionsKilled + p.neutralMinionsKilled) as number,
      durationSecs: data.info.gameDuration as number,
      items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6] as number[],
      spell1Id: p.summoner1Id as number,
      spell2Id: p.summoner2Id as number,
      killParticipation: (p as { challenges?: { killParticipation?: number } }).challenges?.killParticipation,
      teamPosition: (p.teamPosition as string) || undefined,
    });
  }

  if (results.length > 0) {
    try { await kv.set(cacheKey, results, { ex: 300 }); } catch { /* KV unavailable */ }
  }

  return results;
}

// ---------- main ----------

async function fetchPlayer(friend: FriendConfig): Promise<Player> {
  const riotId = `${friend.gameName}#${friend.tagLine}`;
  try {
    const account = await getPuuid(friend.gameName, friend.tagLine);

    const [ranked, live, topChampionName, profileIconId, lastMatches] = await Promise.all([
      getRankedInfo(account.puuid),
      getLiveGame(account.puuid),
      getTopChampion(account.puuid),
      getProfileIconId(account.puuid),
      getLastMatches(account.puuid),
    ]);

    const score = ranked
      ? computeScore(ranked.tier, ranked.rank, ranked.leaguePoints)
      : 0;

    return {
      riotId,
      gameName: account.gameName,
      tagLine: account.tagLine,
      puuid: account.puuid,
      ranked,
      score,
      live,
      lastMatches,
      topChampionName,
      profileIconId,
    };
  } catch (err) {
    return {
      riotId,
      gameName: friend.gameName,
      tagLine: friend.tagLine,
      puuid: null,
      ranked: null,
      score: -1,
      live: null,
      lastMatches: [],
      topChampionName: null,
      profileIconId: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

function fallbackPlayer(friend: FriendConfig, reason: unknown): Player {
  return {
    riotId: `${friend.gameName}#${friend.tagLine}`,
    gameName: friend.gameName,
    tagLine: friend.tagLine,
    puuid: null,
    ranked: null,
    score: -1,
    live: null,
    lastMatches: [],
    topChampionName: null,
    profileIconId: null,
    error: reason instanceof Error ? reason.message : "Unknown error",
  };
}

export async function fetchTierCutoffs(): Promise<TierCutoffs | null> {
  try {
    const [gmRes, challRes] = await Promise.all([
      riotFetch(
        "https://la2.api.riotgames.com/lol/league/v4/grandmasterleagues/by-queue/RANKED_SOLO_5x5",
        { headers: riotHeaders, next: { revalidate: 3600 } }
      ),
      riotFetch(
        "https://la2.api.riotgames.com/lol/league/v4/challengerleagues/by-queue/RANKED_SOLO_5x5",
        { headers: riotHeaders, next: { revalidate: 3600 } }
      ),
    ]);
    if (!gmRes.ok || !challRes.ok) return null;
    const gmData: { entries: { leaguePoints: number }[] } = await gmRes.json();
    const challData: { entries: { leaguePoints: number }[] } = await challRes.json();
    const gmMin = Math.min(...gmData.entries.map((e) => e.leaguePoints));
    const challMin = Math.min(...challData.entries.map((e) => e.leaguePoints));
    return { gmMin, challMin };
  } catch {
    return null;
  }
}

export async function fetchAllPlayers(friends: FriendConfig[]): Promise<Player[]> {
  const players: Player[] = [];
  const BATCH = 3;

  for (let i = 0; i < friends.length; i += BATCH) {
    const batch = friends.slice(i, i + BATCH);
    const settled = await Promise.allSettled(batch.map(fetchPlayer));
    for (let j = 0; j < settled.length; j++) {
      const result = settled[j];
      players.push(
        result.status === "fulfilled"
          ? result.value
          : fallbackPlayer(batch[j], result.reason)
      );
    }
  }

  return players;
}

import { FRIENDS } from "@/config/friends";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name")?.toLowerCase();

  const friend = FRIENDS.find((f) => f.gameName.toLowerCase() === name);
  if (!friend) {
    return Response.json({ error: "Player not found", available: FRIENDS.map((f) => f.gameName) });
  }

  const RIOT_API_KEY = process.env.RIOT_API_KEY!;
  const headers = { "X-Riot-Token": RIOT_API_KEY };

  // Get PUUID
  const accountRes = await fetch(
    `https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(friend.gameName)}/${encodeURIComponent(friend.tagLine)}`,
    { headers }
  );
  if (!accountRes.ok) return Response.json({ error: `account ${accountRes.status}` });
  const account = await accountRes.json();

  // Get live game
  const liveRes = await fetch(
    `https://la2.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${encodeURIComponent(account.puuid)}`,
    { headers }
  );

  if (liveRes.status === 404) return Response.json({ status: "not_in_game" });
  if (!liveRes.ok) return Response.json({ error: `spectator ${liveRes.status}` });

  const data = await liveRes.json();
  return Response.json({
    gameQueueConfigId: data.gameQueueConfigId,
    gameMode: data.gameMode,
    gameType: data.gameType,
    gameStartTime: data.gameStartTime,
    mapId: data.mapId,
  });
}

// Run once to register slash commands with Discord:
//   npm run discord:register
//
// Requires in .env.local:
//   DISCORD_APPLICATION_ID, DISCORD_TOKEN
//   DISCORD_GUILD_ID (optional — for instant testing in a specific server)

const friends = [
  { gameName: "sbaa", tagLine: "7510" },
  { gameName: "Onore", tagLine: "LAS" },
  { gameName: "Grandpa Corki", tagLine: "LAS" },
  { gameName: "LKS", tagLine: "AKD" },
  { gameName: "Любовь", tagLine: "8652" },
  { gameName: "ChoiWee", tagLine: "LAS" },
];

const playerOption = {
  name: "jugador",
  description: "Selecciona el jugador",
  type: 3, // STRING
  required: true,
  choices: friends.map((f) => ({
    name: f.gameName,
    value: `${f.gameName}#${f.tagLine}`,
  })),
};

const commands = [
  {
    name: "tabla",
    description: "Muestra el leaderboard de los mochos",
  },
  {
    name: "elo",
    description: "Muestra el elo detallado de un jugador",
    options: [playerOption],
  },
  {
    name: "kda",
    description: "Muestra el KDA de un jugador en sus últimas 5 partidas",
    options: [playerOption],
  },
  {
    name: "ayuda",
    description: "Muestra todos los comandos disponibles",
  },
];

async function main() {
  const APP_ID = process.env.DISCORD_APPLICATION_ID;
  const TOKEN = process.env.DISCORD_TOKEN;
  const GUILD_ID = process.env.DISCORD_GUILD_ID;

  if (!APP_ID || !TOKEN) {
    console.error("Faltan variables: DISCORD_APPLICATION_ID y/o DISCORD_TOKEN");
    process.exit(1);
  }

  const base = "https://discord.com/api/v10";
  const url = GUILD_ID
    ? `${base}/applications/${APP_ID}/guilds/${GUILD_ID}/commands`
    : `${base}/applications/${APP_ID}/commands`;

  console.log("Registrando en:", url);

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });

  const data = (await res.json()) as Array<{ name: string }>;

  if (!res.ok) {
    console.error("Error:", JSON.stringify(data, null, 2));
    process.exit(1);
  }

  const scope = GUILD_ID
    ? `en el guild ${GUILD_ID}`
    : "globalmente (puede tardar hasta 1h en aparecer)";
  console.log(`Comandos registrados ${scope}:`);
  console.log(data.map((c) => `  /${c.name}`).join("\n"));
}

main();

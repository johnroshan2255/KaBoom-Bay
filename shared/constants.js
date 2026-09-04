/**
 * KaBoom Bay - shared constants.
 * Imported by both the frontend (Three.js client) and the backend (Colyseus server)
 * so gameplay tuning lives in exactly one place.
 */

// ---------- Multiplayer ----------
export const ROOM_NAME = "kaboom_bay";
export const MAX_PLAYERS = 4;
export const MIN_PLAYERS_TO_START = 2;           // humans needed for the automatic countdown; fewer can START_NOW with bots

/** Free-for-all: every island for itself. Teams: islands 0+1 (north row) vs 2+3 (south row). */
export const GameMode = Object.freeze({ FFA: "ffa", TEAMS: "teams" });
export const DEFAULT_GAME_MODE = GameMode.FFA;
export const TEAM_SIZE = 2;
export const TEAM_COUNT = MAX_PLAYERS / TEAM_SIZE;
export const SERVER_TICK_RATE = 20;              // simulation ticks per second
export const SERVER_TICK_MS = 1000 / SERVER_TICK_RATE;

// ---------- Match flow (milliseconds) ----------
// The host picks the match length in the lobby (MIN..MAX minutes); a quarter of it is the build phase.
export const MIN_MATCH_MINUTES = 3;
export const MAX_MATCH_MINUTES = 16;
export const DEFAULT_MATCH_MINUTES = 3;
export const BUILD_FRACTION = 0.25;
export const BUILD_PHASE_DURATION = 45_000;      // build phase at the default 3-minute length
export const COMBAT_PHASE_DURATION = 135_000;    // combat at the default 3-minute length
export const MATCH_DURATION = BUILD_PHASE_DURATION + COMBAT_PHASE_DURATION;
/** Build / combat lengths for a match of `minutes` (clamped to the allowed range). */
export function matchDurations(minutes) {
  const m = Math.min(MAX_MATCH_MINUTES, Math.max(MIN_MATCH_MINUTES, Math.round(Number(minutes) || DEFAULT_MATCH_MINUTES)));
  const total = m * 60_000;
  const buildMs = Math.round(total * BUILD_FRACTION);
  return { minutes: m, buildMs, combatMs: total - buildMs };
}

// ---------- Room size ----------
// A room only uses as many islands as there are participants (humans + bots the host asked for).
export const MAX_BOTS = 3;
export const DEFAULT_BOTS = 3;
/** Island indices in play for `count` participants, chosen so the bay stays balanced around its centre. */
const ISLAND_SETS = Object.freeze({ 1: [0], 2: [0, 3], 3: [0, 1, 3], 4: [0, 1, 2, 3] });
export const activeIslands = (count) => ISLAND_SETS[Math.min(4, Math.max(1, count | 0))];
export const RESULTS_DURATION = 8_000;           // scoreboard before the room closes
export const LOBBY_COUNTDOWN = 5_000;            // wait after enough players join
export const LOBBY_SOLO_WAIT = 6_000;            // public lobby: alone this long -> countdown starts anyway (bots fill), so Play is one click to gameplay

export const MatchPhase = Object.freeze({
  LOBBY: "lobby",
  BUILD: "build",
  COMBAT: "combat",
  RESULTS: "results",
});

// ---------- Bombs ----------
export const BOMB_FUSE_MS = 10_000;              // explodes 10s after being armed, wherever it is
export const BOMB_MAX_THROW_POWER = 38;          // launch speed at full pull; 45° range = v²/g ≈ 72 units, enough to reach the far island
export const BOMB_FULL_POWER_DRAG = 7;           // world units of slingshot pull that maps to full power
export const BOMB_MIN_POWER = 0.08;              // pulls weaker than this cancel the throw
export const BOMB_LAUNCH_ELEVATION = Math.PI / 4; // fixed 45 degree launch angle (range = v^2 / g)
export const BOMB_RADIUS = 0.45;                 // collider + visual radius
export const BOMB_BLAST_RADIUS = 3;              // world units
export const BOMB_PICKUP_RADIUS = 2.6;           // hero must be this close to grab a resting bomb
export const BOMB_RESPAWN_MS = 2_500;            // delay before a player receives a new bomb
export const BOMB_REST_SPEED = 0.35;             // below this speed a landed bomb counts as resting
export const BOMB_REST_TIME_MS = 300;            // must stay slow this long to count as resting
export const BOMB_PAD_OFFSET = 1.1;              // bomb waits this far in front of the hero

export const BombStatus = Object.freeze({ HELD: "held", FLYING: "flying", RESTING: "resting" });

// ---------- Bomb types & supply drops ----------
export const BombType = Object.freeze({ STANDARD: "standard", MEGA: "mega", CLUSTER: "cluster", IMPACT: "impact", CLUSTERLET: "clusterlet" });
/** Per-type tuning. `radius` is the blast radius; `impact` bombs explode on their first landing instead of by fuse. */
export const BOMB_TYPES = Object.freeze({
  [BombType.STANDARD]:   { name: "Bomb",    key: "1", radius: BOMB_BLAST_RADIUS,       scale: 1,    color: 0x23272f, impact: false, cluster: 0, drop: false },
  [BombType.MEGA]:       { name: "Mega",    key: "2", radius: BOMB_BLAST_RADIUS * 1.6, scale: 1.35, color: 0xb42a2a, impact: false, cluster: 0, drop: true },
  [BombType.CLUSTER]:    { name: "Cluster", key: "3", radius: BOMB_BLAST_RADIUS * 0.8, scale: 1.05, color: 0x2f8f4a, impact: false, cluster: 4, drop: true },
  [BombType.IMPACT]:     { name: "Impact",  key: "4", radius: BOMB_BLAST_RADIUS * 1.1, scale: 1,    color: 0xe0a020, impact: true,  cluster: 0, drop: true },
  [BombType.CLUSTERLET]: { name: "Bomblet", key: "",  radius: BOMB_BLAST_RADIUS * 0.65, scale: 0.6, color: 0x2f8f4a, impact: false, cluster: 0, drop: false },
});
/** Types that supply crates can carry (players start every match with only standard bombs). */
export const DROP_TYPES = Object.freeze([BombType.MEGA, BombType.CLUSTER, BombType.IMPACT]);
export const SUPPLY_DROP_INTERVAL_MS = 9_000;    // one crate lands somewhere in the bay this often during combat
export const SUPPLY_DROP_FALL_MS = 2_200;        // crate falls from the sky for this long before it can be picked up
export const SUPPLY_DROP_LIFETIME_MS = 25_000;   // unclaimed crates sink back into the sand
export const CRATE_PICKUP_RADIUS = 2.2;          // hero must be this close to collect a crate
export const CLUSTERLET_FUSE_MS = 1_200;         // bomblets pop shortly after the cluster bomb splits
export const CLUSTERLET_SPEED = 9;               // launch speed of bomblets

// ---------- Blast knockback ----------
export const KNOCKBACK_RADIUS_SCALE = 1.7;       // heroes within blastRadius * this are thrown
export const KNOCKBACK_SPEED = 12;               // horizontal launch speed at the blast centre
export const KNOCKBACK_LIFT = 7;                 // vertical launch speed
export const KNOCKBACK_MOVE_GRACE_MS = 2_000;    // server accepts big MOVE steps this long after a knockback
export const HERO_RESPAWN_COOLDOWN_MS = 500;     // min gap between fall respawns (abuse guard; a double knock can sink you twice quickly)

// ---------- Hero ----------
export const HERO_SPEED = 5.5;                   // walk speed, world units per second
export const HERO_EYE_HEIGHT = 1.55;             // first-person camera height above the feet
export const HERO_STEP_HEIGHT = 1.05;            // can walk up one block
export const MOVE_SEND_HZ = 15;                  // position updates to the server
export const MOVE_MAX_STEP = 4;                  // server rejects teleports longer than this per update
export const THROW_CHARGE_MS = 1100;             // first-person: hold to charge from 20% to 100% power

// ---------- Physics ----------
export const GRAVITY = -20;                      // stronger than Earth for snappy arcade arcs
export const PHYSICS_STEP = 1 / 60;

// ---------- Islands & building ----------
export const ISLAND_COUNT = MAX_PLAYERS;
export const ISLAND_SIZE = 24;                   // world units per island (square footprint)
export const ISLAND_SPACING = 48;                // distance between island centers
export const BUILD_GRID_SIZE = 1;                // voxel snap size in world units
export const MAX_BUILD_HEIGHT = 12;              // voxel layers above the terrain
export const ISLAND_TERRAIN_HEIGHT = 6;          // 4 rock layers (tapered underside) + dirt + grass; beach is one step lower
export const ISLAND_GRID_HEIGHT = ISLAND_TERRAIN_HEIGHT + MAX_BUILD_HEIGHT; // 16 layers total
export const WATER_LEVEL = 1.0;                  // world y of the sea surface (bottom rock layer is submerged)
export const BEDROCK_LAYERS = 1;                 // bottom layers that can never be destroyed
export const MAX_PIECES_PER_ISLAND = 200;

export const BuildPiece = Object.freeze({
  PLANK: "plank",
  BEAM: "beam",
  WALL: "wall",
  ROOF: "roof",
  FLOOR: "floor",
  DOOR: "door",
  WINDOW: "window",
});

// ---------- Scoring ----------
export const COINS_PER_PIECE_DESTROYED = 5;
export const COINS_PER_TERRAIN_BLOCK = 1;
export const COINS_BOMB_RETURNED = 10;           // defender throws a live bomb back off their island
export const COINS_SELF_DESTRUCT_PENALTY = -15;  // held a bomb until it went off

// ---------- Network messages (client <-> server) ----------
export const Message = Object.freeze({
  WELCOME: "welcome",                            // server -> client on join: { now }
  PLACE_PIECE: "place_piece",
  REMOVE_PIECE: "remove_piece",
  MOVE: "move",                                  // client -> server: { x, z, yaw } hero position on own island
  ARM_BOMB: "arm_bomb",                          // client -> server: picked the bomb up, fuse starts
  THROW_BOMB: "throw_bomb",                      // client -> server: { vx, vy, vz }
  GRAB_BOMB: "grab_bomb",                        // client -> server: bomb id resting on my island
  BOMB_SPLASH: "bomb_splash",                    // server -> clients: { x, y, z }
  BOMB_CLASH: "bomb_clash",                      // server -> clients: two bombs hit each other { x, y, z }
  PICK_CRATE: "pick_crate",                      // client -> server: crate id (must be landed, on my island, within CRATE_PICKUP_RADIUS)
  SELECT_BOMB: "select_bomb",                    // client -> server: BombType to use for the next bomb (swaps an unarmed held bomb)
  HERO_RESPAWN: "hero_respawn",                  // client -> server: I fell off my island; server -> client: { x, y, z, yaw } to teleport to
  HERO_FELL: "hero_fell",                        // server -> clients: { by, x, z } splash where a hero hit the water
  SUPPLY_DROP: "supply_drop",                    // server -> clients: { id, islandIndex } a crate is falling
  LOBBY_SETTINGS: "lobby_settings",              // host -> server (lobby): { bots?, minutes? }
  CHAT: "chat",                                  // client -> server: { text, team? }; server -> clients: { from, name, islandIndex, team, text, scope }
  PLAYER_READY: "player_ready",
  START_NOW: "start_now",                        // client -> server (lobby): begin now, bots fill the empty islands
  SWITCH_TEAM: "switch_team",                    // client -> server (lobby, teams mode): { team } to join, default: the other team
  PHASE_CHANGED: "phase_changed",
  BOMB_EXPLODED: "bomb_exploded",
  MATCH_RESULTS: "match_results",
});

// ---------- Chat ----------
export const CHAT_MAX_LEN = 120;
export const CHAT_RATE_MS = 700;                 // min gap between two messages from one player
export const CHAT_HISTORY = 8;                   // lines kept on screen
export const QUICK_CHAT = Object.freeze(["Hi!", "Nice shot!", "Help!", "Bomb incoming!", "Go left", "Go right", "Grab it!", "GG"]);

// ---------- Players / layout ----------
export const PLAYER_COLORS = Object.freeze([0xff5c5c, 0x4da3ff, 0xffd23f, 0x62d26f]); // island 0..3
export const PLAYER_COLOR_NAMES = Object.freeze(["Red", "Blue", "Yellow", "Green"]);
export const TEAM_COLORS = Object.freeze([0xff5c5c, 0x4da3ff]); // team 0 (north), team 1 (south)
export const TEAM_NAMES = Object.freeze(["Red Team", "Blue Team"]);

/** World-space centre of island `index` in the 2x2 layout. */
export function islandCenter(index) {
  const half = ISLAND_SPACING / 2;
  return { x: index % 2 === 0 ? -half : half, y: 0, z: index < 2 ? -half : half };
}

/** World position of island `index`'s grid corner (0,0,0). */
export function islandOrigin(index) {
  const c = islandCenter(index);
  return { x: c.x - ISLAND_SIZE / 2, y: 0, z: c.z - ISLAND_SIZE / 2 };
}

/** Which island's footprint (plus margin) contains a world x/z, or -1 for open water. */
export function islandIndexAt(x, z, margin = 2) {
  for (let i = 0; i < ISLAND_COUNT; i++) {
    const c = islandCenter(i);
    if (Math.abs(x - c.x) <= ISLAND_SIZE / 2 + margin && Math.abs(z - c.z) <= ISLAND_SIZE / 2 + margin) return i;
  }
  return -1;
}

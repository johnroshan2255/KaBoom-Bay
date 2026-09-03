/**
 * KaBoom Bay - shared constants.
 * Imported by both the frontend (Three.js client) and the backend (Colyseus server)
 * so gameplay tuning lives in exactly one place.
 */

// ---------- Multiplayer ----------
export const ROOM_NAME = "kaboom_bay";
export const MAX_PLAYERS = 4;
export const MIN_PLAYERS_TO_START = 2;
export const SERVER_TICK_RATE = 20;              // simulation ticks per second
export const SERVER_TICK_MS = 1000 / SERVER_TICK_RATE;

// ---------- Match flow (milliseconds) ----------
export const BUILD_PHASE_DURATION = 30_000;      // free-form building on your island
export const COMBAT_PHASE_DURATION = 90_000;     // bombing opponents' islands
export const MATCH_DURATION = BUILD_PHASE_DURATION + COMBAT_PHASE_DURATION; // ~2 minutes
export const RESULTS_DURATION = 8_000;           // scoreboard before the room closes
export const LOBBY_COUNTDOWN = 5_000;            // wait after enough players join

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
  PLAYER_READY: "player_ready",
  PHASE_CHANGED: "phase_changed",
  BOMB_EXPLODED: "bomb_exploded",
  MATCH_RESULTS: "match_results",
});

// ---------- Players / layout ----------
export const PLAYER_COLORS = Object.freeze([0xff5c5c, 0x4da3ff, 0xffd23f, 0x62d26f]); // island 0..3
export const PLAYER_COLOR_NAMES = Object.freeze(["Red", "Blue", "Yellow", "Green"]);

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

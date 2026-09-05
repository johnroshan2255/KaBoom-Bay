import { schema, t } from "@colyseus/schema";
import { DEFAULT_GAME, DEFAULT_MAP, GameMode, HERO_MAX_HP, MatchPhase } from "@kaboom-bay/shared";

/** Per-player synced state. Map key is the Colyseus sessionId (or "bot-N"). */
export const PlayerState = schema(
  {
    name: t.string().default("Player"),
    islandIndex: t.uint8().default(0),
    team: t.uint8().default(0), // teamOf(islandIndex, mode); equals islandIndex in free-for-all
    coins: t.int32().default(0),
    ready: t.boolean().default(false),
    connected: t.boolean().default(true),
    isBot: t.boolean().default(false),
    bombs: t.map("uint8"), // special bombs collected from crates: BombType -> count
    selected: t.string().default("standard"), // BombType used for the next bomb
    hp: t.uint8().default(HERO_MAX_HP),
    dead: t.boolean().default(false), // bombed: hidden until the respawn
    captures: t.uint8().default(0), // (legacy) flags brought home
    holdMs: t.uint32().default(0), // capture the flag: total time holding the flag alone; CTF_HOLD_TO_WIN_MS wins
    x: t.float32().default(0),
    y: t.float32().default(0),
    z: t.float32().default(0),
    yaw: t.float32().default(0),
  },
  "PlayerState",
);

/** A placed building piece. Clients expand it to voxel cells with shared pieceCells(). */
export const PieceState = schema(
  {
    owner: t.uint8().default(0), // islandIndex
    type: t.uint8().default(0), // Block id
    x: t.uint8().default(0),
    y: t.uint8().default(0),
    z: t.uint8().default(0),
    rot: t.uint8().default(0),
  },
  "PieceState",
);

/** A live bomb (used from Phase 5). */
export const BombState = schema(
  {
    type: t.string().default("standard"), // BombType
    owner: t.uint8().default(0),
    x: t.float32().default(0),
    y: t.float32().default(0),
    z: t.float32().default(0),
    armedAt: t.number().default(0),
    status: t.string().default("held"), // held | flying | resting
    islandIndex: t.int8().default(-1), // island it rests on
    holder: t.string().default(""), // sessionId holding it
  },
  "BombState",
);

/** A supply crate falling onto an island; once landed a hero can walk over it to collect its bomb type. */
export const CrateState = schema(
  {
    type: t.string().default("mega"), // BombType it carries
    islandIndex: t.uint8().default(0),
    x: t.float32().default(0),
    y: t.float32().default(0), // resting height (top of the ground cell)
    z: t.float32().default(0),
    landsAt: t.number().default(0), // server time when it touches down
    landed: t.boolean().default(false),
  },
  "CrateState",
);

/** Capture the flag: the one flag. status: home (on the hub plaza) | held (above `holder`) | dropped (where the holder died). */
export const FlagState = schema(
  {
    x: t.float32().default(0),
    y: t.float32().default(0),
    z: t.float32().default(0),
    status: t.string().default("home"),
    holder: t.string().default(""), // first holder (for display); every holder is in `holders`
    holders: t.array("string"), // Bomb Squad style: several heroes can hold the flag at once and tug at it
    droppedAt: t.number().default(0),
  },
  "FlagState",
);

/**
 * Whole-match synced state. Reset for every round; nothing is persisted.
 * Terrain damage is synced as diffs: (islandIndex << 16) | cellIndex.
 */
export const BayState = schema(
  {
    phase: t.string().default(MatchPhase.LOBBY),
    mode: t.string().default(GameMode.FFA), // GameMode: "ffa" | "teams"
    map: t.string().default(DEFAULT_MAP), // GameMap: island | volcano | ice | space (fixed for the room's lifetime)
    game: t.string().default(DEFAULT_GAME), // GameType: classic | ctf (fixed for the room's lifetime)
    flag: t.ref(FlagState), // capture the flag only
    buildMs: t.uint32().default(0), // phase lengths for this room (KABOOM_PHASE_SCALE may shorten them)
    combatMs: t.uint32().default(0),
    minutes: t.uint8().default(3), // match length picked by the host
    botCount: t.uint8().default(3), // bots the host wants (free-for-all); teams always fill to 2v2
    islandCount: t.uint8().default(4), // islands in play once the match starts (humans + bots, max 4)
    hostId: t.string().default(''), // sessionId allowed to change lobby settings
    code: t.string().default(''), // short join code shown in the lobby (also in room metadata)
    isPrivate: t.boolean().default(false), // hosted room: no auto countdown, not matched by Play / Quick Join
    phaseEndsAt: t.number().default(0),
    seed: t.uint32().default(1),
    players: t.map(PlayerState),
    pieces: t.map(PieceState),
    bombs: t.map(BombState),
    crates: t.map(CrateState),
    terrainDiffs: t.array("uint32"),
    leftIslands: t.array("uint8"), // islands whose player quit mid-match: gone for everyone (no bot takes over)
  },
  "BayState",
);

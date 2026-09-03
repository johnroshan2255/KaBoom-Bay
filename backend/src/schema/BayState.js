import { schema, t } from "@colyseus/schema";
import { MatchPhase } from "@kaboom-bay/shared";

/** Per-player synced state. Map key is the Colyseus sessionId (or "bot-N"). */
export const PlayerState = schema(
  {
    name: t.string().default("Player"),
    islandIndex: t.uint8().default(0),
    coins: t.int32().default(0),
    ready: t.boolean().default(false),
    connected: t.boolean().default(true),
    isBot: t.boolean().default(false),
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

/**
 * Whole-match synced state. Reset for every round; nothing is persisted.
 * Terrain damage is synced as diffs: (islandIndex << 16) | cellIndex.
 */
export const BayState = schema(
  {
    phase: t.string().default(MatchPhase.LOBBY),
    phaseEndsAt: t.number().default(0),
    seed: t.uint32().default(1),
    players: t.map(PlayerState),
    pieces: t.map(PieceState),
    bombs: t.map(BombState),
    terrainDiffs: t.array("uint32"),
  },
  "BayState",
);

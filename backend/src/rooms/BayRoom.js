import { Room } from "colyseus";
import { MAX_PLAYERS, MIN_PLAYERS_TO_START, MatchPhase, Message, SERVER_TICK_MS, scaledDurations } from "@kaboom-bay/shared";
import { BayState, PlayerState } from "../schema/BayState.js";
import { createIslands } from "../logic/islands.js";
import { placePiece, removePiece } from "../logic/building.js";
import { stepMatch } from "../logic/match.js";
import { MatchPhysics } from "../logic/physics.js";
import { armBomb, grabBomb, throwBomb } from "../logic/bombs.js";
import { handleMove, placeAtSpawn } from "../logic/players.js";

const RECONNECT_SECONDS = 15;
const sanitizeName = (n, fallback) => (typeof n === "string" ? n.replace(/[^\w \-']/g, "").trim().slice(0, 12) : "") || fallback;

/** Authoritative match room: 4 islands, one short round, nothing persisted. */
export class BayRoom extends Room {
  maxClients = MAX_PLAYERS;

  onCreate() {
    this.durations = scaledDurations(Number(process.env.KABOOM_PHASE_SCALE ?? 1));
    this.minPlayers = Number(process.env.KABOOM_MIN_PLAYERS ?? MIN_PLAYERS_TO_START);
    this.countdownEndsAt = 0;
    this.nextPieceId = 1;
    this.nextBombId = 1;
    this.bots = new Map();
    this.bombRecords = new Map(); // bombId -> { thrower, restSince }
    this.respawnAt = new Map(); // sessionId -> time a fresh bomb arrives

    this.setState(new BayState({ seed: (Math.random() * 0xffffffff) >>> 0 }));
    this.islands = createIslands(this.state.seed);
    this.physics = new MatchPhysics(this.islands);

    this.onMessage(Message.PLAYER_READY, (client, ready) => {
      const p = this.state.players.get(client.sessionId);
      if (p && this.state.phase === MatchPhase.LOBBY) p.ready = ready !== false;
    });
    this.onMessage(Message.PLACE_PIECE, (client, msg) => {
      placePiece(this, this.state.players.get(client.sessionId), msg);
    });
    this.onMessage(Message.REMOVE_PIECE, (client, id) => {
      removePiece(this, this.state.players.get(client.sessionId), id);
    });
    this.onMessage(Message.MOVE, (client, msg) => handleMove(this, this.state.players.get(client.sessionId), msg));
    this.onMessage(Message.ARM_BOMB, (client) => armBomb(this, client.sessionId));
    this.onMessage(Message.THROW_BOMB, (client, msg) => throwBomb(this, client.sessionId, msg));
    this.onMessage(Message.GRAB_BOMB, (client, id) => grabBomb(this, client.sessionId, id));

    this.setSimulationInterval(() => stepMatch(this), SERVER_TICK_MS);
  }

  onJoin(client, options = {}) {
    const taken = new Set([...this.state.players.values()].map((p) => p.islandIndex));
    let islandIndex = 0;
    while (taken.has(islandIndex)) islandIndex++;
    const name = sanitizeName(options.name, `Player ${islandIndex + 1}`);
    const player = new PlayerState({ name, islandIndex });
    placeAtSpawn(this, player);
    this.state.players.set(client.sessionId, player);
    client.send(Message.WELCOME, { now: Date.now(), islandIndex });
  }

  async onLeave(client, consented) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const inMatch = this.state.phase !== MatchPhase.LOBBY;
    if (inMatch && !consented) {
      player.connected = false;
      try {
        await this.allowReconnection(client, RECONNECT_SECONDS);
        player.connected = true;
        return;
      } catch {
        /* did not come back */
      }
    }

    if (inMatch) {
      // Keep the island in play: a bot takes over the seat.
      player.connected = false;
      player.isBot = true;
      this.bots.set(client.sessionId, { nextActionAt: 0, rand: Math.random });
    } else {
      this.state.players.delete(client.sessionId);
    }

    const humansLeft = [...this.state.players.values()].some((p) => !p.isBot && p.connected);
    if (!humansLeft) this.disconnect();
  }

  onDispose() {
    this.bots.clear();
    this.physics?.free();
  }
}

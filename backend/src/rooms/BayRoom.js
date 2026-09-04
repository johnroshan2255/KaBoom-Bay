import { Room, matchMaker } from "colyseus";
import { DEFAULT_BOTS, DEFAULT_MATCH_MINUTES, GameMode, MAX_BOTS, MAX_PLAYERS, MIN_PLAYERS_TO_START, MatchPhase, Message, ROOM_NAME, SERVER_TICK_MS, TEAM_COUNT, matchDurations, normalizeMode, pickIsland, scaledDurations, teamIslands, teamOf } from "@kaboom-bay/shared";
import { BayState, PlayerState } from "../schema/BayState.js";
import { createIslands } from "../logic/islands.js";
import { placePiece, removePiece } from "../logic/building.js";
import { beginMatch, stepMatch } from "../logic/match.js";
import { MatchPhysics } from "../logic/physics.js";
import { armBomb, grabBomb, selectBomb, throwBomb } from "../logic/bombs.js";
import { handleMove, heroRespawn, placeAtSpawn } from "../logic/players.js";
import { pickCrate } from "../logic/supply.js";

const RECONNECT_SECONDS = 15;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I look-alikes
const makeCode = () => Array.from({ length: 5 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");
/** A join code no other live room is using. */
async function uniqueCode() {
  const rooms = await matchMaker.query({ name: ROOM_NAME }).catch(() => []);
  const used = new Set(rooms.map((r) => r.metadata?.code));
  let code = makeCode();
  while (used.has(code)) code = makeCode();
  return code;
}
const sanitizeName = (n, fallback) => (typeof n === "string" ? n.replace(/[^\w \-']/g, "").trim().slice(0, 12) : "") || fallback;

/**
 * Authoritative match room: 4 islands, one short round, nothing persisted.
 * Created per game mode (`options.mode`, see index.js filterBy): free-for-all or 2v2 teams.
 */
export class BayRoom extends Room {
  maxClients = MAX_PLAYERS;

  async onCreate(options = {}) {
    this.phaseScale = Number(process.env.KABOOM_PHASE_SCALE ?? 1);
    this.durations = scaledDurations(this.phaseScale, DEFAULT_MATCH_MINUTES);
    this.minPlayers = Number(process.env.KABOOM_MIN_PLAYERS ?? MIN_PLAYERS_TO_START);
    this.countdownEndsAt = 0;
    this.nextPieceId = 1;
    this.nextBombId = 1;
    this.bots = new Map();
    this.bombRecords = new Map(); // bombId -> { thrower, restSince }
    this.respawnAt = new Map(); // sessionId -> time a fresh bomb arrives
    this.knockedAt = new Map(); // sessionId -> time a blast last threw this hero
    this.lobbyOpenedAt = Date.now(); // public lobby: a lone player waits durations.soloWait before the countdown starts
    this.respawnedAt = new Map(); // sessionId -> time of the last fall respawn

    this.setState(new BayState({
      seed: (Math.random() * 0xffffffff) >>> 0,
      mode: normalizeMode(options.mode),
      buildMs: this.durations[MatchPhase.BUILD],
      combatMs: this.durations[MatchPhase.COMBAT],
      minutes: DEFAULT_MATCH_MINUTES,
      botCount: DEFAULT_BOTS,
      isPrivate: options.private === true,
    }));
    this.state.code = await uniqueCode();
    await this.setMetadata({ mode: this.state.mode, code: this.state.code });
    if (this.state.isPrivate) await this.setPrivate(true); // hosted rooms are reached by code or link only
    this.islands = createIslands(this.state.seed);
    this.physics = new MatchPhysics(this.islands);

    this.onMessage(Message.PLAYER_READY, (client, ready) => {
      const p = this.state.players.get(client.sessionId);
      if (p && this.state.phase === MatchPhase.LOBBY) p.ready = ready !== false;
    });
    // Any human in a public lobby may start right away; in a hosted room only the host starts. Bots take the empty islands.
    this.onMessage(Message.START_NOW, (client) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || p.isBot || this.state.phase !== MatchPhase.LOBBY) return;
      if (this.state.isPrivate && client.sessionId !== this.state.hostId) return;
      beginMatch(this, Date.now());
    });
    this.onMessage(Message.SWITCH_TEAM, (client, msg) => this.switchTeam(client, Number.isInteger(msg?.team) ? msg.team : undefined));
    this.onMessage(Message.LOBBY_SETTINGS, (client, msg) => this.applySettings(client, msg));
    this.onMessage(Message.PLACE_PIECE, (client, msg) => {
      placePiece(this, this.state.players.get(client.sessionId), msg);
    });
    this.onMessage(Message.REMOVE_PIECE, (client, id) => {
      removePiece(this, this.state.players.get(client.sessionId), id);
    });
    this.onMessage(Message.MOVE, (client, msg) => handleMove(this, this.state.players.get(client.sessionId), msg, client.sessionId));
    this.onMessage(Message.PICK_CRATE, (client, id) => pickCrate(this, client.sessionId, id));
    this.onMessage(Message.SELECT_BOMB, (client, type) => selectBomb(this, client.sessionId, type));
    this.onMessage(Message.HERO_RESPAWN, (client, msg) => heroRespawn(this, client, msg));
    this.onMessage(Message.ARM_BOMB, (client) => armBomb(this, client.sessionId));
    this.onMessage(Message.THROW_BOMB, (client, msg) => throwBomb(this, client.sessionId, msg));
    this.onMessage(Message.GRAB_BOMB, (client, id) => grabBomb(this, client.sessionId, id));

    this.setSimulationInterval(() => stepMatch(this), SERVER_TICK_MS);
  }

  onJoin(client, options = {}) {
    const taken = [...this.state.players.values()].map((p) => p.islandIndex);
    const islandIndex = pickIsland(taken, this.state.mode);
    if (islandIndex < 0) throw new Error("room is full");
    const name = sanitizeName(options.name, `Player ${islandIndex + 1}`);
    const player = new PlayerState({ name, islandIndex, team: teamOf(islandIndex, this.state.mode) });
    placeAtSpawn(this, player);
    this.state.players.set(client.sessionId, player);
    if (!this.state.hostId) this.state.hostId = client.sessionId; // first human hosts: picks bots and match length
    client.send(Message.WELCOME, { now: Date.now(), islandIndex, mode: this.state.mode });
  }

  /** LOBBY_SETTINGS from the host: bot count (free-for-all) and match length. Teams always fill to 2v2. */
  applySettings(client, msg) {
    if (!msg || client.sessionId !== this.state.hostId || this.state.phase !== MatchPhase.LOBBY) return false;
    if (Number.isInteger(msg.bots) && this.state.mode === GameMode.FFA) this.state.botCount = Math.min(MAX_BOTS, Math.max(0, msg.bots));
    if (Number.isFinite(msg.minutes)) {
      const { minutes } = matchDurations(msg.minutes);
      this.state.minutes = minutes;
      this.durations = scaledDurations(this.phaseScale, minutes);
      this.state.buildMs = this.durations[MatchPhase.BUILD];
      this.state.combatMs = this.durations[MatchPhase.COMBAT];
    }
    return true;
  }

  /** Lobby, teams mode: move the player to a free island on `team` (default: the other team), if there is one. */
  switchTeam(client, team = undefined) {
    const player = this.state.players.get(client.sessionId);
    if (!player || this.state.mode !== GameMode.TEAMS || this.state.phase !== MatchPhase.LOBBY) return false;
    const target = team ?? 1 - player.team;
    if (target < 0 || target >= TEAM_COUNT || target === player.team) return false;
    const taken = new Set([...this.state.players.values()].map((p) => p.islandIndex));
    const free = teamIslands(target).find((i) => !taken.has(i));
    if (free === undefined) return false;
    player.islandIndex = free;
    player.team = teamOf(free, this.state.mode);
    player.ready = false;
    placeAtSpawn(this, player);
    return true;
  }

  /** Unexpected disconnect mid-match: keep the seat for RECONNECT_SECONDS; onLeave runs if they don't come back. */
  async onDrop(client) {
    const player = this.state.players.get(client.sessionId);
    if (!player || this.state.phase === MatchPhase.LOBBY || this.state.phase === MatchPhase.RESULTS) return;
    player.connected = false;
    try {
      await this.allowReconnection(client, RECONNECT_SECONDS);
      player.connected = true;
    } catch {
      /* did not come back: onLeave follows */
    }
  }

  onReconnect(client) {
    const player = this.state.players.get(client.sessionId);
    if (player) client.send(Message.WELCOME, { now: Date.now(), islandIndex: player.islandIndex, mode: this.state.mode });
  }

  /** Final departure (consented leave, or the reconnection window ran out). */
  onLeave(client) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    if (this.state.phase !== MatchPhase.LOBBY) {
      // Keep the island in play: a bot takes over the seat.
      player.connected = false;
      player.isBot = true;
      this.bots.set(client.sessionId, { nextActionAt: 0, rand: Math.random });
    } else {
      this.state.players.delete(client.sessionId);
    }

    const humans = [...this.state.players.entries()].filter(([, p]) => !p.isBot && p.connected);
    if (!humans.length) { this.disconnect(); return; }
    if (this.state.hostId === client.sessionId) this.state.hostId = humans[0][0]; // host left: next human hosts
  }

  onDispose() {
    this.bots.clear();
    this.physics?.free();
  }
}

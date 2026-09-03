import { Client, getStateCallbacks } from "@colyseus/sdk";
import { Message, ROOM_NAME } from "@kaboom-bay/shared";

/** Thin wrapper around the Colyseus SDK. The server is authoritative; we send intents only. */
export class NetworkClient {
  constructor(endpoint) {
    this.endpoint = endpoint;
    this.client = new Client(endpoint);
    this.room = null;
    this.$ = null;
    this.clockOffset = 0; // serverNow - clientNow (ms)
  }

  /** Joins or creates a match and waits for the first full state. */
  async joinMatch(options = {}) {
    const { roomId, ...opts } = options;
    this.room = roomId ? await this.client.joinById(roomId, opts).catch(() => this.client.joinOrCreate(ROOM_NAME, opts)) : await this.client.joinOrCreate(ROOM_NAME, opts);
    this.$ = getStateCallbacks(this.room);
    this.room.onMessage(Message.WELCOME, ({ now }) => this._sync(now));
    this.room.onMessage(Message.PHASE_CHANGED, ({ now }) => now && this._sync(now));
    await new Promise((resolve) => this.room.onStateChange.once(resolve));
    return this.room;
  }

  _sync(serverNow) {
    this.clockOffset = serverNow - Date.now();
  }

  /** Current time on the server's clock, for phase countdowns. */
  serverNow() {
    return Date.now() + this.clockOffset;
  }

  send(type, payload) {
    this.room?.send(type, payload);
  }

  leave() {
    const r = this.room;
    this.room = null;
    this.$ = null;
    return r?.leave(true);
  }
}

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

  /**
   * Joins or creates a match and waits for the first full state.
   * `quick: true` joins the fullest open bay in any mode (people already waiting) and only creates a
   * new room, in `mode`, when nobody is waiting.
   */
  async joinMatch(options = {}) {
    const { roomId, quick = false, host = false, code = null, ...opts } = options;
    if (code) {
      // a typed or linked join code must resolve; never fall back to a random room
      const found = await this.lookupCode(code);
      if (!found.roomId) throw Object.assign(new Error(found.error ?? "not_found"), { code: found.error ?? "not_found" });
      this.room = await this.client.joinById(found.roomId, opts);
    } else if (host) {
      this.room = await this.client.create(ROOM_NAME, { ...opts, private: true });
    }
    if (!this.room && roomId) this.room = await this.client.joinById(roomId, opts).catch(() => null);
    if (!this.room && quick) {
      for (const r of await this.openRooms()) {
        this.room = await this.client.joinById(r.roomId, opts).catch(() => null);
        if (this.room) break;
      }
    }
    if (!this.room) this.room = await this.client.joinOrCreate(ROOM_NAME, opts);
    this.$ = getStateCallbacks(this.room);
    this.room.onMessage(Message.WELCOME, ({ now }) => this._sync(now));
    this.room.onMessage(Message.PHASE_CHANGED, ({ now }) => now && this._sync(now));
    await new Promise((resolve) => this.room.onStateChange.once(resolve));
    return this.room;
  }

  /** Resolves a join code via the server: { roomId, mode } or { error: "not_found" | "started" | "full" | "offline" }. */
  async lookupCode(code) {
    try {
      const res = await fetch(`${this.httpEndpoint()}/code/${encodeURIComponent(String(code).trim().toUpperCase())}`, { signal: AbortSignal.timeout(4000) });
      const body = await res.json().catch(() => ({}));
      return res.ok ? body : { error: body.error ?? "not_found" };
    } catch {
      return { error: "offline" };
    }
  }

  httpEndpoint() {
    return this.endpoint.replace(/^ws(s?):\/\//, "http$1://").replace(/\/$/, "");
  }

  /** Open bays from the server's /rooms endpoint (fullest first); empty when unreachable. */
  async openRooms() {
    try {
      const res = await fetch(`${this.httpEndpoint()}/rooms`, { signal: AbortSignal.timeout(4000) });
      return res.ok ? await res.json() : [];
    } catch {
      return [];
    }
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

  /**
   * Leaves the current room. The server disposes a room right after the results screen, so the socket
   * may already be closed; the SDK's leave() then never settles, hence the timeout.
   */
  async leave() {
    const r = this.room;
    this.room = null;
    this.$ = null;
    if (!r) return;
    await Promise.race([r.leave(true).catch(() => {}), new Promise((res) => setTimeout(res, 1500))]);
  }
}

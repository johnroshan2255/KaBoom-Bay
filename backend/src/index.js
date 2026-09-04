import http from "node:http";
import express from "express";
import { WebSocket } from "ws";
import { Server, matchMaker } from "colyseus";
import { ROOM_NAME } from "@kaboom-bay/shared";
import { BayRoom } from "./rooms/BayRoom.js";
import { initPhysics } from "./logic/physics.js";

// Colyseus core compares `client.readyState` against the global `WebSocket.OPEN` when a player
// reconnects. Node 22+ ships that global; Node 20 does not, so provide it from `ws`.
globalThis.WebSocket ??= WebSocket;

const PORT = Number(process.env.PORT ?? 2567);

const app = express();
app.use(express.json());
app.get("/health", (_req, res) => res.json({ ok: true, game: "KaBoom Bay" }));
// Resolve a join code (from a link or typed in) to a room the client can joinById.
app.get("/code/:code", async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  const code = String(req.params.code ?? "").toUpperCase();
  try {
    const room = (await matchMaker.query({ name: ROOM_NAME })).find((r) => r.metadata?.code === code);
    if (!room) return res.status(404).json({ error: "not_found" });
    if (room.locked) return res.status(409).json({ error: "started" });
    if (room.clients >= room.maxClients) return res.status(409).json({ error: "full" });
    res.json({ roomId: room.roomId, mode: room.metadata?.mode, clients: room.clients, maxClients: room.maxClients });
  } catch (err) {
    console.error("[KaBoom Bay] /code failed", err);
    res.status(500).json({ error: "server" });
  }
});
// Open bays for the client's Quick Join: unlocked rooms with a free island, fullest first.
app.get("/rooms", async (_req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  try {
    const rooms = await matchMaker.query({ name: ROOM_NAME, locked: false, private: false });
    res.json(rooms
      .filter((r) => r.clients < r.maxClients)
      .sort((a, b) => b.clients - a.clients)
      .map((r) => ({ roomId: r.roomId, clients: r.clients, maxClients: r.maxClients, mode: r.metadata?.mode })));
  } catch (err) {
    console.error("[KaBoom Bay] /rooms failed", err);
    res.status(500).json([]);
  }
});

const httpServer = http.createServer(app);
const gameServer = new Server({ server: httpServer });

gameServer.define(ROOM_NAME, BayRoom).filterBy(["mode"]).sortBy({ clients: -1 }); // modes never mix; fill the fullest bay first

await initPhysics(); // Rapier WASM, once per process
gameServer.listen(PORT).then(() => {
  console.log(`[KaBoom Bay] Colyseus listening on ws://localhost:${PORT} (room "${ROOM_NAME}")`);
});

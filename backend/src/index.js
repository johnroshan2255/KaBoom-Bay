import http from "node:http";
import express from "express";
import { Server } from "colyseus";
import { ROOM_NAME } from "@kaboom-bay/shared";
import { BayRoom } from "./rooms/BayRoom.js";
import { initPhysics } from "./logic/physics.js";

const PORT = Number(process.env.PORT ?? 2567);

const app = express();
app.use(express.json());
app.get("/health", (_req, res) => res.json({ ok: true, game: "KaBoom Bay" }));

const httpServer = http.createServer(app);
const gameServer = new Server({ server: httpServer });

gameServer.define(ROOM_NAME, BayRoom);

await initPhysics(); // Rapier WASM, once per process
gameServer.listen(PORT).then(() => {
  console.log(`[KaBoom Bay] Colyseus listening on ws://localhost:${PORT} (room "${ROOM_NAME}")`);
});

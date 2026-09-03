# KaBoom Bay – Development Roadmap

A step-by-step plan from the current scaffold to a CrazyGames-ready release.
Phases are ordered so that each one produces something playable or testable.
Every phase ends with a **Done when** check; do not start the next phase until it passes.

Legend: `F` = frontend, `B` = backend, `S` = shared.

---

## Architecture decisions (read first)

These decisions shape every phase below.

| Topic | Decision | Why |
| --- | --- | --- |
| Authority | Server owns all game state. Client sends *intents* (place piece, throw bomb, grab bomb), never results. | Cheating prevention and one source of truth for 4 clients. |
| Physics | **Rapier everywhere** (`@dimforge/rapier3d-compat`). The server world is authoritative: bomb arcs, bounces, rest detection. The client runs its own Rapier world for the aim-preview arc and cosmetic debris, using the same colliders and gravity so the preview matches what the server will do. | One physics engine, identical results on both sides, deterministic enough that the preview is trustworthy. |
| Simulation code | Pure, deterministic rules (voxel grid, blast resolution, snapping, scoring) live in `shared/` and run on both sides. | Client can predict and preview; server validates with the same code. |
| World data | Each island is a fixed voxel grid (`ISLAND_SIZE` x `MAX_BUILD_HEIGHT` x `ISLAND_SIZE`) stored as a `Uint8Array`. Buildings are pieces occupying grid cells. | Cheap to sync, cheap to destroy, matches the pixelated-3D look. |
| Sync strategy | Colyseus schema for players/pieces/bombs; terrain damage sent as **diffs** (list of removed cell indices), not full grids. | Keeps bandwidth tiny for 4 players on mobile. |
| Graphics API | **WebGL 2 only** via `THREE.WebGLRenderer`. No `WebGPURenderer`, no TSL node materials. Shaders are written as GLSL `ShaderMaterial` when custom effects are needed. | WebGPU is still missing on many phones and older browsers that CrazyGames serves; WebGL 2 covers essentially every player and keeps the bundle smaller. |
| Rendering | `InstancedMesh` per block/piece type with a small palette texture. Low `pixelRatio`, no antialias. | Thousands of voxels in a handful of draw calls; chunky pixel look for free. |
| Art pipeline | Procedural voxel meshes for terrain/pieces; MagicaVoxel (`.vox`) → glTF for hero props (palm trees, bomb, characters). | Small download, consistent style. |
| Empty seats | Bots fill seats so a match always has 4 islands and starts fast. | "Gameplay within one click" even at low player counts. |
| Persistence | None. Rooms are disposed after results. | Matches the design; simplifies backend to stateless processes. |

Tick rate: server 20 Hz simulation, clients interpolate. Match = 30 s build + 90 s combat.

---

## Phase 0 – Foundations ✅

Scaffold, dependencies, workspaces, shared constants, verified client join and production build.

---

## Phase 1 – Offline sandbox: prove the core feel (F, S) ✅

Shipped: `frontend/src/game/Sandbox.js` boots straight into a one-island sandbox (`?seed=N` for a fixed island).
Rapier terrain uses one cuboid collider per contiguous solid run in each voxel column (~400 for an island, rebuilt in ~4 ms), which also works in Node for the server in Phase 5.

Goal: one island, one bomb, drag-to-aim, blast removes voxels. No networking yet.
This is the fastest way to find out whether the game is fun before investing in netcode.

Steps
1. `S` `shared/voxel/VoxelGrid.js` – flat `Uint8Array` grid with `get/set/index(x,y,z)`, block type enum (`AIR, SAND, GRASS, ROCK, PIECE_*`), bounds checks.
2. `S` `shared/voxel/islandGen.js` – deterministic island generator from a seed: sandy disc, grass top, a few rock cells, palm anchor points.
3. `F` `game/rendering/VoxelMesher.js` – builds an `InstancedMesh` per block type from a `VoxelGrid`; `rebuild(dirtyCells)` for incremental updates.
4. `F` `game/rendering/camera.js` – fixed isometric-ish camera per island with gentle orbit; `worldToIsland` helpers.
5. `F` `game/bombs/AimController.js` – pointer down on your island → drag → release. Maps drag vector to launch velocity using `BOMB_MAX_DRAG_DISTANCE` / `BOMB_MAX_THROW_POWER`. Draw a dotted trajectory preview.
6. `F` `game/bombs/LocalBombSim.js` – client Rapier world: sphere rigid body, ground collider from the island's top surface, detect rest.
7. `S` `shared/rules/blast.js` – `resolveBlast(grid, centre, radius)` → list of removed cells and coin value. Pure function.
8. `F` Fuse timer visual (ring around the bomb), explosion → remove cells → `rebuild(dirty)`.

Done when: you can throw bombs at your own island in the browser and blow holes in it at 60 fps.

---

## Phase 2 – Shared rules library (S) ✅

Shipped: `shared/rules/{pieces,placement,scoring,phases}.js`, `npm test` runs 10 node:test cases.

Goal: everything the server must validate exists once, in `shared/`, with tests.

Steps
1. `S` `shared/rules/pieces.js` – piece catalog: footprint (cells occupied), rotation variants, cost, HP, material.
2. `S` `shared/rules/placement.js` – `canPlace(grid, piece, pos, rot, ownerIslandBounds)`: inside island, cells free, supported (touches ground or another piece), under `MAX_BUILD_HEIGHT`, under `MAX_PIECES_PER_ISLAND`.
3. `S` `shared/rules/scoring.js` – coins per removed cell/piece, bomb-returned bonus, self-destruct penalty.
4. `S` `shared/rules/phases.js` – phase state machine (`LOBBY → BUILD → COMBAT → RESULTS`) with durations from constants.
5. `S` Add `node --test` unit tests for each rule file (`npm test` at root).

Done when: `npm test` is green and Phase 1 sandbox imports its rules from `shared/`.

---

## Phase 3 – Networked match flow (B, F) ✅

Shipped: schema v5 state (players, pieces, bombs, terrain diffs), `BayRoom` with seat assignment, lobby countdown,
bots filling empty islands, validated PLACE/REMOVE handlers, reconnection; client lobby, four-island match view,
clock sync via WELCOME/PHASE_CHANGED. Dev knobs: `KABOOM_PHASE_SCALE=0.3` (shorter phases) and `KABOOM_MIN_PLAYERS=1` (solo + bots).

Goal: 2–4 real players join, see each other's islands, and phases advance on a server timer.

Steps
1. `B` Expand `schema/BayState.js`: `PlayerState` (name, islandIndex, coins, ready, connected, isBot), `PieceState` map, `BombState` map, `terrainDiffs` per island (array of removed indices).
2. `B` `rooms/BayRoom.js`: seat assignment (islands 0–3), lobby countdown once `MIN_PLAYERS_TO_START` joined, `lock()` on start, phase timer using `shared/rules/phases.js`, `allowReconnection` for 15 s.
3. `B` `logic/bots.js` – fill empty seats at start with bots that place a simple preset and throw at random targets; mark `isBot`.
4. `B` Message handlers for all `Message.*` constants with validation via shared rules; reject invalid intents silently.
5. `F` `net/client.js`: join flow, state listeners (`onAdd/onChange/onRemove`) feeding a client-side world model; reconnection with token.
6. `F` Render all 4 islands from server state; local player's island is front and centre.
7. `F` Lobby UI: player list, countdown, "Play" button that is the *one click* into a room.

Done when: two browser tabs join, see four islands (bots fill the rest), and both watch the phase change from build to combat.

---

## Rendering pass – match the voxel art reference ✅

Done ahead of Phase 4 so building UI targets the final mesher. Reference: `docs/reference/art-direction-01.png`.
- `rendering/atlas.js`: procedural 16x16 pixel-art tiles (grass, mossy stone, sand, wood, planks, roof tiles…) drawn to a canvas atlas, nearest filtered.
- `rendering/VoxelMesher.js`: per-island mesh of visible faces with atlas UVs and baked per-vertex ambient occlusion.
- Warm key light + soft PCF shadows + cool fill, ACES tone mapping, narrow 30° FOV for the near-isometric look.
- Islands are now stepped floating chunks: tapered rock underside, beach step, grass plateau with dirt cliff, hill.
- `characters/CharacterFactory.js`: procedural chibi voxel heroes (1/8-block voxels, team colours, four accessories: bandana, captain's hat, pirate scarf, flower crown) standing at each island's launch pad with an idle bob.
- `rendering/Mist.js`: drifting low-lying mist sprites around every island's cliffs plus a light exponential distance haze.
- UI theme: lobby modal and HUD restyled to the game palette (deep-sea teal panels, sand + wood pixel frames with notched corners, Press Start 2P titles, team-colour squares, 3D bevel buttons). Fonts load from Google Fonts for now; self-host in Phase 9.
- Still to come in Phase 6: lanterns, waterfalls, water shader, throw animation for the heroes.

## Phase 4 – Build phase (F, B) ✅

Shipped: `frontend/src/game/islands/BuildController.js` - raycast against your island mesh, ghost snapped to the hit face, footprint centred on the
cursor, green/red from shared `canPlace`, click/tap to place, right-click or Remove mode to delete your own pieces, R rotates, keys 1-7 select.
Build bar in the HUD with piece swatches, Rotate, Remove and the piece budget. Camera zooms onto your island for the build phase and back out for combat.
Verified in headless Chrome: floor placed, rotated wall stacked on it, floating piece rejected, right-click and Remove-mode deletion, bar hidden in combat.

## Phase 4 – original plan (reference)

Goal: free-form voxel building with snapping, synced to everyone.

Steps
1. `F` `game/islands/BuildController.js` – piece palette (plank, beam, wall, roof, floor, door, window), ghost preview snapped to `BUILD_GRID_SIZE`, rotate (R key / rotate button), place on click/tap, remove on right-click/long-press.
2. `F` Face-based snapping: raycast against existing pieces and terrain, offset by hit normal so pieces stack and attach on any side.
3. `F` Ghost turns red when `canPlace` fails; show remaining piece budget.
4. `B` `PLACE_PIECE` / `REMOVE_PIECE` handlers: validate with shared `placement.js`, write to `PieceState`, only during `BUILD`.
5. `F` Instanced rendering of pieces per material; incremental rebuild on schema changes.
6. `F` Mobile layout: bottom piece bar, rotate/undo buttons, camera orbit with two-finger drag.

Done when: four players build different shapes simultaneously and everyone sees the same result.

---

## Phase 5 – Combat phase (B, F) ✅ (core)

Shipped: server-side Rapier (`backend/src/logic/physics.js`) with shared terrain colliders (`shared/physics/terrainColliders.js`, so buildings collide too),
bomb lifecycle in `logic/bombs.js` (ARM → THROW → flying/resting → GRAB by the defender → fuse blast), blast damage as terrain diffs, coins for hits on
rival islands, self-destruct penalty, bomb-returned bonus, bots that grab and lob, mid-air bomb-vs-bomb collisions with a BOMB_CLASH spark event.
Client: interpolated bomb views, drag-to-throw from your held bomb, tap-to-grab, fire + smoke + shockwave explosion, sparks, hero throw pose, voxel clouds.
Bombs fly without air drag so the preview arc, the server flight and the bot lob formula agree. Max throw speed 38 (45° range ≈ 72 units).
Left for later: unsupported-voxel collapse after blasts, bomb pickup radius tied to the hero walking, mobile hit-target sizing.

## Phase 5 – original plan (reference)

Goal: authoritative bombs with fuses, grab-and-return, destruction and coins.

Steps
1. `B` `logic/physics.js` – Rapier world per room: static trimesh/heightfield colliders per island (rebuilt on terrain change), bomb sphere bodies. Step at 20 Hz.
2. `B` `logic/bombs.js` – bomb lifecycle: `armedAt` set when the player picks it up; `THROW_BOMB` validates power/direction and spawns a body; when body sleeps set `restingOn` island; `GRAB_BOMB` succeeds if the defender is on that island and the bomb is within `BOMB_PICKUP_RADIUS`; fuse expiry → `resolveBlast` on whatever island the bomb is on (or the holder's own island if still held).
3. `B` Apply blast: remove voxels and pieces, append to `terrainDiffs`, award coins to the thrower (or penalise the holder), broadcast `BOMB_EXPLODED`.
4. `B` Respawn a new bomb in the thrower's hand after `BOMB_RESPAWN_MS`.
5. `F` Interpolate bomb positions from schema; fuse ring on every visible bomb; big warning pulse in the last 3 s.
6. `F` Throw input reuses Phase 1 aim controller; target any opponent island; local preview arc only.
7. `F` Grab input: tap a resting bomb on your island, then aim and throw it away.
8. `F` Destruction feedback: remove voxels, spawn falling debris cubes (client-only, short-lived), cartoon smoke puff, screen shake.

Done when: a full 2-minute match runs end to end with real scores, and throwing a live bomb back works.

---

## Phase 6 – Presentation & audio (F) ✅ (core)

Shipped: animated sea (waves + shimmer patched into the lit material so cloud shadows and fog still apply), voxel lantern with a flickering light
beside each hero, synthesized WebAudio sound set (`frontend/src/audio/Sound.js`: throw, tick, boom, coin, penalty, splash, clash, place, remove,
grab, phase chime, win/lose, surf ambience) with a persistent SND ON/OFF toggle, portrait-orientation prompt on phones.
Earlier in this phase: textured voxels, AO, heroes, mist, clouds, explosion VFX, results screen, themed HUD/modal.
Left: waterfalls, invite link (Phase 7), self-hosted fonts (Phase 9).

## Phase 6 – original plan (reference)

Goal: the tropical cartoon voxel look and PEGI-12-safe feedback.

Steps
1. Palette texture (16–32 colours) and toon-flat lighting; bright sky gradient, simple animated water plane shader.
2. Hero props: palm trees, bomb, flag per player colour; export from MagicaVoxel as glTF (Draco or meshopt compressed), place in `public/assets/models`.
3. Particle effects: smoke puffs, star bursts, coin pop-ups. No blood, no fire on characters.
4. HUD: phase timer, coin counter, 4-player scoreboard, fuse indicator, "Your island" marker.
5. Results screen: rankings, coins, "Play again" (rejoins matchmaking) and "Invite" link.
6. Audio: short OGG/MP3 clips (throw, tick, boom, coin, whistle), a light steel-drum loop. Total audio < 2 MB. Mute toggle.
7. Resize and orientation handling; landscape prompt on phones.

Done when: a stranger can tell what is happening in a 10-second clip with no explanation.

---

## Controls & platform pass ✅

- Heroes walk: WASD / arrows / virtual joystick relative to the camera, one-block step-ups, can't leave the island. Position synced (MOVE, validated server-side against the island grid and a max step), other players interpolated.
- Views: third-person orbit (right-drag / two-finger) and first-person (V key / VIEW button) with Pointer Lock mouse look on desktop and drag-to-look on touch.
- Bomb controls: third person = slingshot drag; first person / touch = hold to charge, release to throw along the crosshair; E / GRAB picks up a resting bomb (auto-runs to it when far, drops your own unarmed bomb if needed). Held bombs follow the hero on the server.
- Build in first person: crosshair placement, right-click remove, wheel cycles pieces. Can't build on the cell you stand in.
- Touch UI (`ui/touch.js`): joystick, look zone, THROW/PLACE, GRAB/REMOVE, ROT, view toggle. HUD collapses on screens under 900px; portrait phones get a rotate prompt.
- CrazyGames SDK v3 wrapper (`platform/crazygames.js`): init → loadingStart/Stop, gameplayStart on build, gameplayStop + happytime at results, midgame ad (sound ducked) on Play again, username as default name, invite `room` param joins that room. Every call is a no-op without the SDK.
- Verified in headless Chrome with a fake SDK: menu name from SDK user, loading start/stop, gameplayStart 1 / gameplayStop 1, one midgame ad on replay; phone emulation (844×390, touch) shows joystick and buttons, joystick moves the hero, view toggle works, no horizontal scroll.

## Phase 7 – Platform & CrazyGames integration (F, B)

Steps
1. Add the CrazyGames HTML5 SDK: `init`, `gameplayStart`/`gameplayStop` around matches, `happytime` on win, `requestAd` (midgame) between matches, `inviteLink` for friend rooms.
2. Guest identity: random tropical name + colour, optional CrazyGames username when available. No login.
3. Read `?room=` from invite links and `joinById`.
4. Backend: `WSS` behind TLS, CORS restricted to CrazyGames and your domains, health endpoint, graceful shutdown that lets rooms finish.
5. `.env` handling for `VITE_SERVER_URL` in production.

Done when: the game runs inside the CrazyGames QA iframe with ads and one-click start.

---

## Phase 8 – Bots, balance & polish (S, B, F)

Steps
1. Bot difficulty: aim noise, throw cadence, sometimes grabs live bombs.
2. Tune constants in `shared/constants.js` from playtests: fuse pressure, blast radius, piece budget, coin values.
3. Anti-grief: rate-limit messages per client, clamp throw power server-side, ignore intents outside the correct phase.
4. Accessibility: colour-blind-safe player colours, large touch targets (≥ 44 px), reduced-motion option for shake.
5. Idle handling: kick AFK players after the build phase; bots take over their island.

Done when: 10 consecutive playtests produce no exploit and match scores are usually close.

---

## Phase 9 – Performance & download size (F)

Budget: < 10 MB initial download (limit is 50 MB), 60 fps on a mid-range Android phone.

Steps
1. Bundle analysis (`rolldown` output + `vite-bundle-visualizer`). Rapier stays on the client; load its chunk in parallel with the lobby screen so `RAPIER.init()` has finished before the first match starts.
2. Texture atlas, KTX2/Basis or small PNGs; Draco/meshopt glTF.
3. Instancing audit: one draw call per material; frustum-cull islands off screen.
4. Cap `pixelRatio` at 1; dynamic resolution scaling if frame time > 20 ms.
5. Brotli on hosting; preload critical assets, stream audio after first frame.
6. Profile on a real phone with Chrome remote debugging.

Done when: Lighthouse-style load < 3 s on 4G and steady 60 fps on the test phone.

---

## Phase 10 – Deployment, QA & launch (B, F)

Steps
1. Backend hosting: Colyseus Cloud (simplest) or Fly.io/VPS with `pm2`; one region first, add regions later. Enable `@colyseus/monitor` behind auth.
2. Frontend: static host (CrazyGames upload of `frontend/dist`); versioned asset URLs.
3. Load test with `@colyseus/loadtest` at 50+ concurrent rooms.
4. CrazyGames submission checklist: no external links, PEGI 12 content, responsive, SDK events firing, 50 MB limit, works in iframe.
5. Crash/error reporting (lightweight, e.g. Sentry browser SDK) and basic metrics (matches/day, average players per room).
6. Soft launch, watch metrics, iterate on Phase 8 tuning.

Done when: live on CrazyGames with a healthy error rate and rooms filling within 10 s.

---

## Suggested order and rough effort

| Phase | Effort (solo dev) | Deliverable |
| --- | --- | --- |
| 1 Offline sandbox | 3–4 days | Throwing bombs at voxels feels good |
| 2 Shared rules | 2 days | Tested rules library |
| 3 Networked flow | 3–4 days | Multi-tab lobby with phases |
| 4 Build phase | 4–5 days | Free-form building synced |
| 5 Combat phase | 5–6 days | Full authoritative match |
| 6 Presentation | 5–7 days | Looks and sounds like the pitch |
| 7 Platform | 2 days | Runs on CrazyGames QA |
| 8 Polish | 3–5 days | Balanced, bot-filled |
| 9 Performance | 2–3 days | Fast on phones |
| 10 Launch | 2–3 days | Live |

Roughly 6–8 weeks of focused work.

---

## Key risks and mitigations

- **Server-side physics cost** – 4 bombs per room is trivial for Rapier; rebuild island colliders only on damage, not every tick.
- **Terrain sync size** – never send the full grid after start; diffs only. Late joiners/reconnects receive a compressed snapshot once.
- **Mobile input conflicts** – aiming and camera both use drag; reserve one-finger drag on your own island for aiming and two-finger for camera.
- **Empty matchmaking** – bots guarantee a match starts within `LOBBY_COUNTDOWN` of the first click.
- **Package churn** – Colyseus client is `@colyseus/sdk` (0.18), Vite 8 uses Rolldown options. Pin minor versions before launch.

# KaBoom Bay

**Build your island. Bomb your rivals.**

KaBoom Bay is a 4-player online arcade game in a pixelated-3D voxel style, built for the
[CrazyGames](https://www.crazygames.com) web portal. Each player owns a bright tropical
island of palm trees, sandy beaches and chibi-style rounded houses, and every round is a
short, self-contained brawl.

## Gameplay

1. **Build phase** – Each of the 4 players gets their own island. Place free-form building
   pieces (planks, beams, walls, roofs, floors and other simple materials) that snap together
   voxel-style. There are no house templates: combine pieces however you like to create your
   own structure shapes.
2. **Combat phase** – Launch bombs Angry-Birds style: drag to aim, release to throw in an arc
   at an opponent's island. Blasts destroy buildings and terrain in cartoon puffs.
3. **The 10-second fuse** – Every bomb explodes 10 seconds after it is armed, wherever it is.
   Hold it too long and it blows up in your hands. If it lands on an island, the fuse keeps
   ticking and the defender can grab it and hurl it away before it goes off.
4. **Coins** – Destroying an opponent's structures earns coins. Highest total when the
   timer runs out wins.

Matches last around 2 minutes and nothing persists: every round starts fresh with empty islands.

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Walk | WASD / arrows | Left joystick |
| Camera | Right-drag or Z / C to rotate, wheel or + / − to zoom (3RD and TOP), mouse look (1ST) | Two-finger drag, pinch or + / − buttons (3RD and TOP), drag right half (1ST) |
| Switch view | V cycles 3RD (default) → TOP → 1ST | VIEW button cycles |
| Build | Hover + click, R rotate, right-click remove, 1–7 pieces | PLACE / REMOVE / ROT buttons |
| Throw | Drag back from your bomb (3rd), hold + release (1st) | Hold THROW, release |
| Grab a landed bomb | Tap it or press E | GRAB |

## Requirements

- Runs in the browser (HTML5 / WebGL), gameplay starts within one click
- Under CrazyGames' 50 MB initial download limit
- PEGI 12 compliant: cartoonish destruction, no gore
- Desktop mouse/keyboard **and** mobile touch input

## Tech stack

| Layer      | Technology                                                | Role                                     |
| ---------- | --------------------------------------------------------- | ---------------------------------------- |
| Rendering  | [Three.js](https://threejs.org)                           | Voxel-style 3D scene, pixelated look     |
| Physics    | [Rapier](https://rapier.rs) (`@dimforge/rapier3d-compat`) | Bomb arcs, collisions, falling debris    |
| Multiplayer| [Colyseus](https://colyseus.io) (`colyseus` server / `@colyseus/sdk` client) | Authoritative rooms and state sync    |
| Backend    | Node.js + Express                                         | Game server, health/matchmaking endpoints|
| Build      | [Vite](https://vite.dev)                                  | Fast dev server and optimized bundles    |

## Project structure

```
KaBoom-Bay/
├── frontend/                 # Vite + Three.js client
│   ├── public/assets/        # models/, textures/, audio/
│   └── src/
│       ├── game/islands/     # island terrain + free-form building pieces
│       ├── game/bombs/       # drag-to-aim bombs and fuse logic
│       ├── game/rendering/   # Three.js renderer, camera, pixel look
│       ├── net/              # Colyseus client wrapper
│       └── ui/               # HUD, menus, touch controls
├── backend/                  # Node.js + Colyseus authoritative server
│   └── src/
│       ├── rooms/            # Colyseus rooms (BayRoom)
│       ├── schema/           # @colyseus/schema synced state
│       └── logic/            # match flow, bombs, scoring
└── shared/                   # constants shared by client and server
    └── constants.js          # fuse time, match duration, max players, room name…
```

## Getting started

```bash
npm install            # installs all three workspaces
npm run dev:backend    # Colyseus server on ws://localhost:2567
npm run dev:frontend   # Vite dev server on http://localhost:5173
```

Copy `frontend/.env.example` to `frontend/.env` to point the client at a different server.

```bash
npm test                                   # shared rules unit tests
KABOOM_PHASE_SCALE=0.3 npm run dev:backend # 3x shorter phases for local testing
KABOOM_MIN_PLAYERS=1 npm run dev:backend   # start a match solo, bots fill the other islands
```

Open `http://localhost:5173/?sandbox` for the offline one-island sandbox (add `&seed=N` for a fixed island).

`npm run build` produces the production bundle in `frontend/dist/` for upload to CrazyGames.

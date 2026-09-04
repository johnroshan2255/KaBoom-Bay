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
4. **Supply drops** – During combat, crates parachute onto the islands. Walk over one (or press E /
   GRAB) to collect a special bomb: **Mega** (huge blast), **Cluster** (splits into four bomblets) or
   **Impact** (explodes on landing, no fuse to throw back). Keys 1–4 or the bomb bar pick which bomb
   you throw next; the bomb in your hand swaps type on the spot.
5. **Blast waves** – Heroes near an explosion are thrown through the air, and bombs bounce off them.
   Land in the water and you swim back to your beach after a moment.
6. **Coins** – Destroying an opponent's structures earns coins. Highest total when the
   timer runs out wins.

Nothing persists: every round starts fresh with empty islands. The host picks the match length in the
lobby (3 to 16 minutes; a quarter of it is the build phase) and, in free-for-all, how many bots join
(0 to 3). A room only uses as many islands as there are participants: play alone on one island, 1v1 on
two, three-way on three, or a full bay of four. Teams mode always fills to 2v2.

### Modes

| Mode | Who you fight | Scoring |
| --- | --- | --- |
| **Free for all** (default) | You vs 1 to 3 rivals (humans and/or bots), one island each | Highest personal coin total wins |
| **Teams 2v2** | North islands (red) vs south islands (blue) | Team coin totals are summed; bombing a teammate's island earns nothing |

Pick the mode on the main menu and press **Play** to be matched with strangers, or **Quick Join** to drop
into whichever open bay already has people waiting. To play with friends press **Host Room**: you get a
private room with a five-letter code and a link (`?code=XXXXX`) to share; friends type the code into
**Join** or open the link. Private rooms are never matched by Play or Quick Join and only the host
starts them.
Free-for-all and team lobbies never mix. The lobby shows the match length (build, combat, total) and
lists every island, with bot slots for the empty ones: bots always fill them when a match starts, and
anyone in the lobby can press **Start with bots** instead of waiting, so the game is playable solo,
with one friend, or with a full room. In teams mode players who arrive together land on the same team;
each team card shows a **Join** button while the other side still has a free island.

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Walk | WASD / arrows | Left joystick |
| Camera | Drag (any mouse button) or Z / C to rotate, wheel or + / − to zoom (3RD and TOP), mouse look (1ST) | One-finger drag to rotate, pinch or + / − buttons to zoom (3RD and TOP), drag anywhere (1ST) |
| Switch view | V cycles 3RD (default) → TOP → 1ST | VIEW button cycles |
| Build | Hover + click, R rotate, right-click remove, 1–7 pieces | PLACE / REMOVE / ROT buttons |
| Throw | Drag back from your bomb (3rd), hold + release (1st) | Hold THROW, release |
| Grab a landed bomb / crate | Tap it or press E | GRAB |
| Pick bomb type | 1–4 or the bomb bar | Bomb bar |
| Chat | Enter or T opens the box, Enter sends, Esc closes | CHAT button, quick phrases |

## Art direction

Islands follow `docs/reference/art-direction-01.png`: a floating mossy-rock chunk with a sandy beach, a
grass plateau and two stepped tiers (every step is one block high, so heroes can walk everywhere), a
carved-stone ruin with pillars and a low broken wall around the upper tier, round trees and palms you
can walk under, bushes, mushrooms, flower speckles, and a stream that spills off the rim as a waterfall.
Blocks are near-flat voxel tiles with per-block colour drift, baked ambient occlusion and darkened
silhouette edges so they read as bevelled voxels rather than textured cubes. All of it is one mesh per
island plus four small waterfall quads, so the look costs a few hundred triangles, and the lowest
quality tier drops the flower decals.

## Performance

Graphics scale to the device through three quality tiers (`high`, `medium`, `low`) chosen at boot from
a device heuristic and lowered automatically while a match runs below roughly 34 fps for a few seconds.
The chosen tier is remembered for the next visit. Force one with `?quality=low|medium|high` in the URL.

| Tier | Render scale | Shadows | Water | Mist puffs / island | Explosion light |
| --- | --- | --- | --- | --- | --- |
| high | up to 1.5× | 2048px, clouds cast | animated shimmer | 16 | yes |
| medium (phones, ≤4 cores) | 1× | 1024px | animated shimmer | 10 | yes |
| low | 0.75× | off | plain waves | 6 | no |

All clouds share one instanced draw call, each island's mist is a single vertex-shader-animated mesh,
lanterns glow with an additive sprite instead of a point light, and every effect shader is compiled
before the first frame so explosions never stall.

## CrazyGames checklist

What the build does for the portal (see `frontend/src/platform/`):

- **SDK v3**: `init` awaited before anything else; `loadingStart`/`loadingStop` around boot; `gameplayStart` at the
  build phase and `gameplayStop` at results or when a player leaves mid-match; `happytime` only on a win; one
  `midgame` ad request at the results screen, audio muted only once the ad actually starts and restored on finish
  or error; `game.settings.muteAudio` overrides the in-game sound toggle; every call is a no-op outside the portal.
- **Chat**: text is trimmed, capped at 120 characters, rate limited server-side and run through a profanity
  filter on the server before it is relayed; the portal's `disableChat` setting removes the chat entirely.
- **Multiplayer**: invite links carry `?code=XXXXX` and `getInviteParam("code")` routes straight to the room;
  `showInviteButton` while a room is joinable, hidden when it starts; `isInstantMultiplayer` skips the menu;
  the same group carries on in the same room after each round (new islands, scores reset); CrazyGames usernames
  are the default display names. Lobby size to declare at submission: **4**.
- **Technical**: one click from menu to gameplay (a lone player's public lobby starts itself with bots); build
  output uses relative paths and is about 3.6 MB (2.8 MB of it the Rapier physics WASM); fonts are self-hosted so
  the SDK script is the only third-party request; arrows and space never scroll the page; no context menu; no
  Escape binding; movement uses physical key codes so AZERTY works; `user-select: none` for mobile; the audio
  context resumes on the next gesture after iOS suspends it; three graphics tiers with automatic downgrade for
  low-end devices; a sitelock allows CrazyGames domains and apps (`VITE_SITELOCK=off` to host elsewhere).
- **Deployment**: the Colyseus server must be reachable over `wss://` (set `VITE_SERVER_URL` at build time);
  the client zip is uploaded to CrazyGames.

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

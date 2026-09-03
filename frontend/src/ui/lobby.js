import { PLAYER_COLORS, MAX_PLAYERS } from "@kaboom-bay/shared";

const colorHex = (i) => `#${PLAYER_COLORS[i % PLAYER_COLORS.length].toString(16).padStart(6, "0")}`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const ADJ = ["Sandy", "Salty", "Sunny", "Coco", "Mango", "Breezy", "Tiki", "Lagoon", "Coral", "Palm"];
const NOUN = ["Crab", "Parrot", "Turtle", "Gecko", "Pelican", "Dolphin", "Monkey", "Toucan", "Iguana", "Puffer"];
export const randomName = () => `${ADJ[(Math.random() * ADJ.length) | 0]} ${NOUN[(Math.random() * NOUN.length) | 0]}`;

/**
 * Lobby / results modal styled like the game itself: deep-sea teal panel, sand-and-wood pixel
 * frame with notched corners, pixel display font, chunky 3D buttons in grass green and sea blue.
 */
let el = null;
function root() {
  if (el) return el;
  el = document.createElement("div");
  el.id = "lobby";
  el.innerHTML = `<style>
    #lobby { position:fixed; inset:0; display:grid; place-items:center; pointer-events:auto; font-family: Nunito, system-ui, sans-serif;
      background: radial-gradient(ellipse at 50% 35%, rgba(6,40,60,.2), rgba(4,25,40,.72)); }
    #lobby[hidden] { display:none; }
    #lobby .px { font-family: "Press Start 2P", monospace; }
    #lobby .shadow { filter: drop-shadow(0 12px 0 rgba(3,20,32,.55)); }
    #lobby .frame { background:#6d4320; padding:6px;
      clip-path: polygon(10px 0, calc(100% - 10px) 0, 100% 10px, 100% calc(100% - 10px), calc(100% - 10px) 100%, 10px 100%, 0 calc(100% - 10px), 0 10px); }
    #lobby .card { background:#0f3446; color:#f3f7f9; border:4px solid #f1d48e; padding:26px 30px 30px; min-width:300px; max-width:88vw; text-align:center;
      box-shadow: inset 0 0 0 3px #1a4a5f, inset 0 -6px 0 3px #0a2533; }
    #lobby h1 { margin:0 0 8px; font-family:"Press Start 2P", monospace; font-size:26px; line-height:1.35; color:#ffd23f;
      text-shadow: 3px 3px 0 #b53d1a, 6px 6px 0 rgba(0,0,0,.35); letter-spacing:1px; }
    #lobby .sub { margin:0 0 20px; color:#a9d6e6; font-weight:700; font-size:15px; }
    #lobby .sub b { color:#ffd23f; }
    #lobby input { font: 700 18px/1.2 Nunito, system-ui, sans-serif; color:#fff; padding:11px 14px; width:100%; text-align:center; box-sizing:border-box; margin-bottom:16px;
      background:#082130; border:3px solid #1fb6dc; outline:none; box-shadow: inset 0 4px 0 rgba(0,0,0,.35); }
    #lobby input:focus { border-color:#ffd23f; }
    #lobby button { font-family:"Press Start 2P", monospace; font-size:14px; letter-spacing:1px; text-transform:uppercase; padding:16px 26px; cursor:pointer;
      background:#62d26f; color:#0d3b1a; border:3px solid #0d3b1a; box-shadow: 0 6px 0 #2e9e4f, 0 6px 0 3px #0d3b1a; transition: transform .05s, box-shadow .05s; }
    #lobby button:hover { background:#78e085; }
    #lobby button:active { transform:translateY(5px); box-shadow: 0 1px 0 #2e9e4f, 0 1px 0 3px #0d3b1a; }
    #lobby button:focus-visible { outline:3px solid #ffd23f; outline-offset:3px; }
    #lobby button.secondary { background:#1fb6dc; color:#062a3a; border-color:#062a3a; box-shadow: 0 6px 0 #0e7fa3, 0 6px 0 3px #062a3a; font-size:11px; padding:12px 20px; }
    #lobby button.secondary:hover { background:#4cc9e8; }
    #lobby button.secondary:active { box-shadow: 0 1px 0 #0e7fa3, 0 1px 0 3px #062a3a; }
    #lobby ul { list-style:none; padding:0; margin:14px 0 18px; text-align:left; display:grid; gap:6px; }
    #lobby li { display:flex; align-items:center; gap:10px; padding:9px 12px; background:#082130; border:2px solid #1a4a5f; font-weight:800; font-size:15px; }
    #lobby li .sq { width:14px; height:14px; flex:none; box-shadow: inset -3px -3px 0 rgba(0,0,0,.35), 0 0 0 2px #062a3a; }
    #lobby li .tag { margin-left:auto; font-family:"Press Start 2P", monospace; font-size:9px; color:#a9d6e6; }
    #lobby li .tag.ok { color:#62d26f; }
    #lobby li .rank { font-family:"Press Start 2P", monospace; font-size:11px; width:38px; text-align:left; }
    #lobby li .coins { margin-left:auto; font-family:"Press Start 2P", monospace; font-size:11px; color:#ffd23f; display:flex; align-items:center; gap:6px; }
    #lobby .coin { display:inline-block; width:11px; height:11px; background:#ffd23f; box-shadow: inset -3px -3px 0 #d99a1a, 0 0 0 2px #7a4a10; }
    #lobby .count { font-family:"Press Start 2P", monospace; font-size:15px; line-height:1.6; color:#ffd23f; margin:6px 0 14px; text-shadow: 2px 2px 0 rgba(0,0,0,.4); }
    #lobby .err { color:#ff6b3d; font-weight:800; margin:0 0 16px; }
  </style><div class="shadow"><div class="frame"><div class="card"></div></div></div>`;
  document.getElementById("ui").appendChild(el);
  return el;
}
const card = () => root().querySelector(".card");
const sq = (i) => `<span class="sq" style="background:${colorHex(i)}"></span>`;

export const lobby = {
  showMenu({ defaultName, onPlay }) {
    root().hidden = false;
    card().innerHTML = `
      <h1>KaBoom<br>Bay</h1>
      <p class="sub">Build your island. Bomb your rivals.</p>
      <input id="lobby-name" maxlength="12" value="${esc(defaultName)}" aria-label="Your name" spellcheck="false" />
      <div><button id="lobby-play">▶ Play</button></div>`;
    const input = card().querySelector("#lobby-name");
    const go = () => onPlay(input.value.trim() || defaultName);
    card().querySelector("#lobby-play").addEventListener("click", go);
    input.addEventListener("keydown", (e) => e.key === "Enter" && go());
  },

  showConnecting() {
    root().hidden = false;
    card().innerHTML = `<h1>KaBoom<br>Bay</h1><p class="sub">Finding a bay…</p>`;
  },

  showWaiting({ players, myKey, countdownMs, onReady }) {
    root().hidden = false;
    const me = players.find((p) => p.key === myKey);
    const rows = players
      .sort((a, b) => a.islandIndex - b.islandIndex)
      .map((p) => `<li>${sq(p.islandIndex)}${esc(p.name)}${p.key === myKey ? " (you)" : ""}<span class="tag ${p.ready ? "ok" : ""}">${p.ready ? "READY" : "..."}</span></li>`)
      .join("");
    card().innerHTML = `
      <h1>KaBoom<br>Bay</h1>
      <p class="sub">Players <b>${players.length}/${MAX_PLAYERS}</b> · empty islands get bots</p>
      <ul>${rows}</ul>
      <div class="count" data-countdown>${countdownMs != null ? `Starting in ${Math.max(0, Math.ceil(countdownMs / 1000))}` : "Need one more player"}</div>
      <p><button class="secondary" id="lobby-ready">${me?.ready ? "Not ready" : "Ready!"}</button></p>`;
    card().querySelector("#lobby-ready").addEventListener("click", () => onReady(!me?.ready));
  },

  setCountdown(ms) {
    const c = card().querySelector("[data-countdown]");
    if (c) c.textContent = `Starting in ${Math.max(0, Math.ceil(ms / 1000))}`;
  },

  showResults({ ranked, myKey, onAgain }) {
    root().hidden = false;
    const place = ["1ST", "2ND", "3RD", "4TH"];
    const rankColor = ["#ffd23f", "#cfd8dc", "#d19a5a", "#a9d6e6"];
    const rows = ranked
      .map((p) => `<li><span class="rank" style="color:${rankColor[p.rank - 1] ?? "#fff"}">${place[p.rank - 1] ?? p.rank}</span>${sq(p.islandIndex)}${esc(p.name)}${p.key === myKey ? " (you)" : ""}<span class="coins"><i class="coin"></i>${p.coins}</span></li>`)
      .join("");
    const me = ranked.find((p) => p.key === myKey);
    const leaders = ranked.filter((p) => p.rank === 1).length;
    const title = me?.rank === 1 ? (leaders > 1 ? "Draw!" : "You win!") : "Match over";
    card().innerHTML = `
      <h1>${title}</h1>
      <p class="sub">${me ? `You finished <b>${place[me.rank - 1] ?? me.rank}</b>` : ""}</p>
      <ul>${rows}</ul>
      <div><button id="lobby-again">▶ Play again</button></div>`;
    card().querySelector("#lobby-again").addEventListener("click", onAgain);
  },

  showError(message, onRetry) {
    root().hidden = false;
    card().innerHTML = `<h1>KaBoom<br>Bay</h1><p class="err">${esc(message)}</p><div><button id="lobby-retry">Try again</button></div>`;
    card().querySelector("#lobby-retry").addEventListener("click", onRetry);
  },

  hide() {
    root().hidden = true;
  },
};

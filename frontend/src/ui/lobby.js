import { GameMode, MAX_BOTS, MAX_MATCH_MINUTES, MAX_PLAYERS, MIN_MATCH_MINUTES, MIN_PLAYERS_TO_START, PLAYER_COLORS, TEAM_COLORS, TEAM_NAMES, TEAM_SIZE, BUILD_PHASE_DURATION, COMBAT_PHASE_DURATION, rankTeams, teamOf } from "@kaboom-bay/shared";

const hex = (c) => `#${c.toString(16).padStart(6, "0")}`;
const colorHex = (i) => hex(PLAYER_COLORS[i % PLAYER_COLORS.length]);
const teamHex = (t) => hex(TEAM_COLORS[t % TEAM_COLORS.length]);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const MODE_KEY = "kaboom-mode";
export const savedMode = () => { try { return localStorage.getItem(MODE_KEY) === GameMode.TEAMS ? GameMode.TEAMS : GameMode.FFA; } catch { return GameMode.FFA; } };
const saveMode = (m) => { try { localStorage.setItem(MODE_KEY, m); } catch { /* private mode */ } };

const ADJ = ["Sandy", "Salty", "Sunny", "Coco", "Mango", "Breezy", "Tiki", "Lagoon", "Coral", "Palm"];
const NOUN = ["Crab", "Parrot", "Turtle", "Gecko", "Pelican", "Dolphin", "Monkey", "Toucan", "Iguana", "Puffer"];
export const randomName = () => `${ADJ[(Math.random() * ADJ.length) | 0]} ${NOUN[(Math.random() * NOUN.length) | 0]}`;

// ---------- pixel-art icons drawn with box-shadow (no image files) ----------
const PAL = { B: "#3b414d", W: "#9aa3b4", X: "#ffd23f", O: "#ff6b3d", R: "#ff5c5c", L: "#4da3ff", S: "#f6c9a0", Y: "#ffd23f", G: "#62d26f", M: "#a9d6e6", D: "#062a3a", K: "#0f3446" };
const ICONS = {
  bomb: ["...OX...", "....O...", "..BBBB..", ".BWWBBB.", "BWBBBBBB", "BBBBBBBB", ".BBBBBB.", "..BBBB.."],
  team: ["........", ".RR..LL.", "RSSRLSSL", "RSSRLSSL", ".RR..LL.", ".RRR.LLL", ".RRR.LLL", "........"],
  bolt: ["....YY..", "...YY...", "..YY....", ".YYYYY..", "...YY...", "..YY....", ".YY.....", "YY......"],
  check: ["......GG", ".....GG.", "....GG..", "GG.GG...", ".GGG....", "..G....."],
  bot: ["...M....", ".MMMMMM.", ".MDMMDM.", ".MMMMMM.", "..MMMM..", ".M.MM.M."],
  crown: ["Y..Y..Y.", "YY.Y.YY.", "YYYYYYY.", "YYYYYYY.", ".YYYYY.."],
  hourglass: ["MMMMMM..", ".MXXM...", ".MXXM...", "..MM....", ".M..M...", ".MXXM...", "MMMMMM.."],
  hero: ["..SSSS..", "..SDSD..", "..SSSS..", ".RRRRRR.", "..RRRR..", "..D..D.."],
};
/** `<span>` containing a 1px square whose box-shadow paints the icon at `s` px per pixel. */
export function pixelIcon(name, s = 3, recolor = {}) {
  const rows = ICONS[name];
  if (!rows) return "";
  const shadows = [];
  rows.forEach((row, y) => [...row].forEach((ch, x) => { const c = recolor[ch] ?? PAL[ch]; if (ch !== "." && c) shadows.push(`${x * s}px ${y * s}px 0 0 ${c}`); }));
  const w = rows[0].length * s, h = rows.length * s;
  return `<span class="pxicon" style="width:${w}px;height:${h}px"><i style="width:${s}px;height:${s}px;box-shadow:${shadows.join(",")}"></i></span>`;
}

/**
 * Menu / lobby / results modal in the game's own pixel style: dithered backdrop, stepped sand-and-wood
 * frame, "Press Start 2P" everywhere, chunky 3D buttons, and box-shadow pixel icons.
 */
let el = null;
function root() {
  if (el) return el;
  el = document.createElement("div");
  el.id = "lobby";
  el.innerHTML = `<style>
    #lobby { position:fixed; inset:0; display:grid; place-items:center; padding:12px; overflow:auto; pointer-events:auto; font-family:"Press Start 2P", monospace; color:#f3f7f9;
      background:
        repeating-conic-gradient(rgba(3,20,32,.22) 0 25%, transparent 0 50%) 0 0 / 6px 6px,
        radial-gradient(ellipse at 50% 35%, rgba(6,40,60,.25), rgba(4,25,40,.78));
      image-rendering: pixelated; }
    #lobby[hidden] { display:none; }
    #lobby * { box-sizing:border-box; }
    #lobby .pxicon { display:inline-block; position:relative; vertical-align:middle; flex:none; }
    #lobby .pxicon i { position:absolute; left:0; top:0; display:block; }
    #lobby .frame { position:relative; filter: drop-shadow(0 10px 0 rgba(3,20,32,.6)); }
    #lobby .wood { background:#6d4320; padding:6px;
      clip-path: polygon(9px 0, calc(100% - 9px) 0, 100% 9px, 100% calc(100% - 9px), calc(100% - 9px) 100%, 9px 100%, 0 calc(100% - 9px), 0 9px); }
    #lobby .sand { background:#f1d48e; padding:4px;
      clip-path: polygon(6px 0, calc(100% - 6px) 0, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 0 calc(100% - 6px), 0 6px); }
    #lobby .card { background:#0f3446; padding:22px 24px 24px; min-width:320px; max-width:min(92vw, 640px); text-align:center;
      box-shadow: inset 0 0 0 3px #1a4a5f, inset 0 -6px 0 3px #0a2533;
      clip-path: polygon(3px 0, calc(100% - 3px) 0, 100% 3px, 100% calc(100% - 3px), calc(100% - 3px) 100%, 3px 100%, 0 calc(100% - 3px), 0 3px); }
    #lobby h1 { margin:0 0 6px; font-size:28px; line-height:1.3; color:#ffd23f; letter-spacing:1px;
      text-shadow: 3px 3px 0 #b53d1a, 6px 6px 0 #062a3a; }
    #lobby h1.small { font-size:18px; margin-bottom:10px; }
    #lobby h1 .pxicon { margin:0 8px 6px 0; }
    #lobby .sub { margin:0 0 16px; color:#a9d6e6; font-size:9px; line-height:1.9; }
    #lobby .sub b { color:#ffd23f; }
    #lobby .label { display:block; text-align:left; font-size:8px; color:#a9d6e6; margin:0 0 6px 2px; letter-spacing:1px; }
    #lobby input { font:12px/1.4 "Press Start 2P", monospace; color:#fff; padding:12px 10px 10px; width:100%; text-align:center; margin-bottom:14px; text-transform:uppercase;
      background:#082130; border:3px solid #1fb6dc; outline:none; box-shadow: inset 0 4px 0 rgba(0,0,0,.35), 0 3px 0 #0a2533; caret-color:#ffd23f; }
    #lobby input:focus { border-color:#ffd23f; }
    #lobby button { font:11px/1 "Press Start 2P", monospace; letter-spacing:1px; text-transform:uppercase; padding:15px 20px 13px; cursor:pointer; color:#0d3b1a;
      background:#62d26f; border:3px solid #0d3b1a; box-shadow: 0 6px 0 #2e9e4f, 0 6px 0 3px #0d3b1a; transition: transform .05s, box-shadow .05s;
      display:inline-flex; align-items:center; justify-content:center; gap:10px; }
    #lobby button:hover { background:#78e085; }
    #lobby button:active { transform:translateY(5px); box-shadow: 0 1px 0 #2e9e4f, 0 1px 0 3px #0d3b1a; }
    #lobby button:focus-visible { outline:3px solid #ffd23f; outline-offset:3px; }
    #lobby button.big { font-size:14px; padding:18px 28px 16px; }
    #lobby button.secondary { background:#1fb6dc; color:#062a3a; border-color:#062a3a; box-shadow: 0 6px 0 #0e7fa3, 0 6px 0 3px #062a3a; }
    #lobby button.secondary:hover { background:#4cc9e8; }
    #lobby button.secondary:active { box-shadow: 0 1px 0 #0e7fa3, 0 1px 0 3px #062a3a; }
    #lobby button.quick { background:#ff9a3d; color:#3a1a10; border-color:#3a1a10; box-shadow: 0 6px 0 #b55a1a, 0 6px 0 3px #3a1a10; }
    #lobby button.quick:hover { background:#ffb060; }
    #lobby button.quick:active { box-shadow: 0 1px 0 #b55a1a, 0 1px 0 3px #3a1a10; }
    #lobby button.mini { font-size:8px; padding:9px 10px 8px; gap:6px; box-shadow: 0 4px 0 #0e7fa3, 0 4px 0 3px #062a3a; }
    #lobby button.mini:active { box-shadow: 0 1px 0 #0e7fa3, 0 1px 0 3px #062a3a; }
    #lobby button.on { background:#ffd23f; color:#3a1a10; border-color:#3a1a10; box-shadow: 0 6px 0 #b58a1a, 0 6px 0 3px #3a1a10; }
    #lobby .row { display:flex; gap:12px; justify-content:center; flex-wrap:wrap; }
    #lobby .modes { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:0 0 16px; }
    #lobby .modes button { flex-direction:column; gap:8px; font-size:10px; padding:12px 8px 10px; background:#082130; color:#a9d6e6; border-color:#1a4a5f; box-shadow: 0 4px 0 #041520, 0 4px 0 3px #1a4a5f; }
    #lobby .modes button small { font-size:7px; color:#7fb6c9; letter-spacing:0; text-transform:none; line-height:1.6; }
    #lobby .modes button.on { background:#1fb6dc; color:#062a3a; border-color:#062a3a; box-shadow: 0 4px 0 #0e7fa3, 0 4px 0 3px #062a3a; }
    #lobby .modes button.on small { color:#0a3d4f; }
    #lobby .timeline { display:flex; align-items:stretch; gap:0; margin:14px 0 6px; font-size:8px; line-height:1.6; }
    #lobby .timeline > div { flex:1; padding:8px 6px 6px; border:3px solid #062a3a; color:#062a3a; }
    #lobby .timeline > div b { display:block; font-size:11px; margin-top:3px; }
    #lobby .timeline .b { background:#62d26f; }
    #lobby .timeline .c { background:#ff6b3d; color:#fff; border-left:none; }
    #lobby .timeline .r { background:#ffd23f; border-left:none; }
    #lobby .note { font-size:7px; color:#7fb6c9; margin:8px 0 0; line-height:1.9; }
    #lobby .teams { display:grid; grid-template-columns:1fr auto 1fr; gap:10px; align-items:start; margin:6px 0 4px; text-align:left; }
    #lobby .vs { align-self:center; font-size:14px; color:#ffd23f; text-shadow:2px 2px 0 #b53d1a; padding:0 2px; }
    #lobby .team { border:3px solid #062a3a; background:#082130; box-shadow: 0 4px 0 #041520; }
    #lobby .team header { display:flex; align-items:center; gap:8px; padding:8px 10px 7px; font-size:9px; color:#fff; text-shadow:1px 1px 0 rgba(0,0,0,.5); border-bottom:3px solid #062a3a; }
    #lobby .team header .count { margin-left:auto; font-size:8px; }
    #lobby .team .join { display:flex; justify-content:center; padding:8px; }
    #lobby ul { list-style:none; padding:0; margin:0; display:grid; gap:0; text-align:left; }
    #lobby ul.ffa { margin:10px 0 4px; border:3px solid #062a3a; background:#082130; box-shadow: 0 4px 0 #041520; }
    #lobby li { display:flex; align-items:center; gap:9px; padding:10px 10px 9px; font-size:9px; border-bottom:3px solid #062a3a; min-height:40px; }
    #lobby li:last-child { border-bottom:none; }
    #lobby li.slot { color:#4f8aa3; }
    #lobby li .sq { width:12px; height:12px; flex:none; box-shadow: inset -3px -3px 0 rgba(0,0,0,.35), 0 0 0 2px #062a3a; }
    #lobby li .name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    #lobby li .you { color:#ffd23f; }
    #lobby li .tag { margin-left:auto; font-size:8px; color:#a9d6e6; display:flex; align-items:center; gap:6px; }
    #lobby li .tag.ok { color:#62d26f; }
    #lobby li .rank { font-size:10px; width:34px; text-align:left; }
    #lobby li .coins { margin-left:auto; font-size:10px; color:#ffd23f; display:flex; align-items:center; gap:6px; }
    #lobby li.teamrow { color:#fff; text-shadow:1px 1px 0 rgba(0,0,0,.5); font-size:10px; }
    #lobby li.teamrow .coins { color:#fff; }
    #lobby .coin { display:inline-block; width:10px; height:10px; background:#ffd23f; box-shadow: inset -3px -3px 0 #d99a1a, 0 0 0 2px #7a4a10; }
    #lobby .status { font-size:12px; line-height:1.6; color:#ffd23f; margin:12px 0 12px; text-shadow: 2px 2px 0 rgba(0,0,0,.4); min-height:20px; }
    #lobby .status.wait { color:#a9d6e6; animation: blink 1.2s steps(2) infinite; }
    @keyframes blink { to { opacity:.55; } }
    #lobby .invite { margin:0 0 12px; padding:8px 10px; background:#082130; border:3px solid #ff9a3d; font-size:9px; color:#ffd23f; display:flex; align-items:center; justify-content:center; gap:8px; }
    #lobby .friends { margin-top:12px; }
    #lobby form.code { display:inline-flex; gap:0; }
    #lobby form.code input { width:112px; margin:0; text-align:center; letter-spacing:3px; font-size:12px; padding:12px 8px 10px; border-color:#062a3a; box-shadow:none; text-transform:uppercase; }
    #lobby form.code button { padding:12px 14px 10px; font-size:10px; }
    #lobby .roomcode { display:flex; align-items:center; justify-content:center; gap:10px; margin:0 0 12px; padding:8px 10px; background:#082130; border:3px solid #062a3a; font-size:8px; color:#a9d6e6; }
    #lobby .roomcode b { color:#ffd23f; font-size:16px; letter-spacing:4px; }
    #lobby .linkbox { width:min(100%, 320px); margin:0; font-size:8px; padding:8px; text-transform:none; }
    #lobby .settings { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin:12px 0 0; }
    #lobby .setting { display:flex; align-items:center; gap:8px; padding:6px 10px; background:#082130; border:3px solid #062a3a; font-size:8px; color:#a9d6e6; }
    #lobby .setting b { color:#ffd23f; font-size:10px; min-width:52px; text-align:center; }
    #lobby .setting button.mini { padding:6px 9px 5px; font-size:10px; min-width:0; }
    #lobby .setting button[disabled] { opacity:.35; cursor:default; transform:none; }
    #lobby li .host { color:#ff9a3d; font-size:7px; margin-left:4px; }
    #lobby .err { color:#ff6b3d; font-size:9px; line-height:1.9; margin:0 0 16px; }
    #lobby .cursor { display:inline-block; width:8px; height:12px; background:#ffd23f; vertical-align:-2px; animation: blink .8s steps(2) infinite; }
    @media (max-height: 440px) {
      #lobby { place-items:start center; }
      #lobby .card { padding:12px 16px 14px; }
      #lobby h1 { font-size:18px; margin-bottom:4px; }
      #lobby h1.small { font-size:14px; margin-bottom:6px; }
      #lobby .sub { margin-bottom:8px; }
      #lobby .note, #lobby .label { display:none; }
      #lobby input { margin-bottom:8px; padding:9px 8px 7px; }
      #lobby .modes { margin-bottom:10px; }
      #lobby .modes button { padding:8px 6px 6px; }
      #lobby .timeline { margin:8px 0 4px; }
      #lobby .timeline > div { padding:4px 4px 3px; font-size:7px; } #lobby .timeline > div b { font-size:9px; margin-top:2px; }
      #lobby .menu .timeline, #lobby .invite { display:none; }
      #lobby .friends { margin-top:8px; }
      #lobby .row { gap:8px; }
      #lobby form.code input { padding:9px 6px 7px; width:96px; }
      #lobby form.code button, #lobby button.quick, #lobby #lobby-host { padding:10px 12px 8px; font-size:9px; }
      #lobby .status { margin:6px 0 8px; font-size:10px; }
      #lobby li { min-height:32px; padding:6px 8px 5px; }
      #lobby button.big { font-size:11px; padding:12px 18px 10px; }
      #lobby button { padding:11px 14px 9px; }
    }
    @media (max-width: 560px) {
      #lobby .card { padding:16px 14px 18px; min-width:0; }
      #lobby h1 { font-size:20px; }
      #lobby .teams { grid-template-columns:1fr; }
      #lobby .vs { display:none; }
      #lobby button.big { font-size:12px; padding:15px 20px 13px; }
    }
  </style><div class="frame"><div class="wood"><div class="sand"><div class="card"></div></div></div></div>`;
  document.getElementById("ui").appendChild(el);
  return el;
}
const card = () => root().querySelector(".card");
const sq = (color) => `<span class="sq" style="background:${color}"></span>`;
const title = (small = false) => `<h1 class="${small ? "small" : ""}">${pixelIcon("bomb", small ? 3 : 4)}KaBoom Bay</h1>`;

/** Build / combat / results strip. Durations in ms (from the room state when known). */
function timeline({ buildMs = BUILD_PHASE_DURATION, combatMs = COMBAT_PHASE_DURATION } = {}) {
  return `<div class="timeline" aria-label="Match length">
      <div class="b">BUILD<b>${mmss(buildMs)}</b></div>
      <div class="c">COMBAT<b>${mmss(combatMs)}</b></div>
      <div class="r">TOTAL<b>${mmss(buildMs + combatMs)}</b></div>
    </div>`;
}

export const lobby = {
  /**
   * Main menu: name, mode (free-for-all or 2v2 teams), Play (in that mode) or Quick Join (any bay with
   * people already waiting). onPlay(name, mode), onQuick(name, mode).
   */
  showMenu({ defaultName, defaultMode = savedMode(), inviteCode = null, onPlay, onQuick, onHost, onJoinCode }) {
    root().hidden = false;
    let mode = defaultMode === GameMode.TEAMS ? GameMode.TEAMS : GameMode.FFA;
    card().classList.add("menu");
    card().innerHTML = `
      ${title()}
      <p class="sub">BUILD YOUR ISLAND. BOMB YOUR RIVALS.</p>
      <span class="label">YOUR NAME</span>
      <input id="lobby-name" maxlength="12" value="${esc(defaultName)}" aria-label="Your name" spellcheck="false" autocomplete="off" />
      <span class="label">GAME MODE</span>
      <div class="modes" role="radiogroup" aria-label="Game mode">
        <button data-mode="${GameMode.FFA}" role="radio">${pixelIcon("bomb", 3)}FREE FOR ALL<small>You vs 3 rivals</small></button>
        <button data-mode="${GameMode.TEAMS}" role="radio">${pixelIcon("team", 3)}TEAMS 2V2<small>Team up with a friend</small></button>
      </div>
      ${inviteCode ? `<div class="invite">${pixelIcon("bolt", 2)} INVITED TO ROOM <b>${esc(inviteCode)}</b></div>` : ""}
      <div class="row">
        ${inviteCode ? `<button class="big" id="lobby-join-invite">&#9654; JOIN ${esc(inviteCode)}</button>` : `<button class="big" id="lobby-play">&#9654; PLAY</button>`}
        <button class="quick" id="lobby-quick" title="Join any bay where players are already waiting">${pixelIcon("bolt", 2)}QUICK JOIN</button>
      </div>
      <div class="row friends">
        <button class="secondary" id="lobby-host" title="Open a private room and share its code or link">${pixelIcon("team", 2)}HOST ROOM</button>
        <form class="code" id="lobby-code-form" autocomplete="off"><input id="lobby-code" maxlength="5" placeholder="CODE" aria-label="Room code" spellcheck="false" value="${inviteCode ? esc(inviteCode) : ""}" /><button class="secondary" type="submit">JOIN</button></form>
      </div>
      ${timeline()}
      <p class="note">PLAY MATCHES YOU WITH STRANGERS. HOST A ROOM TO PLAY WITH FRIENDS: THEY JOIN WITH YOUR CODE OR LINK. EMPTY ISLANDS ARE FILLED BY BOTS.</p>`;
    const input = card().querySelector("#lobby-name");
    const buttons = [...card().querySelectorAll("[data-mode]")];
    const paint = () => buttons.forEach((b) => { const on = b.dataset.mode === mode; b.classList.toggle("on", on); b.setAttribute("aria-checked", on); });
    buttons.forEach((b) => b.addEventListener("click", () => { mode = b.dataset.mode; saveMode(mode); paint(); }));
    paint();
    const name = () => input.value.trim() || defaultName;
    card().querySelector("#lobby-play")?.addEventListener("click", () => onPlay(name(), mode));
    card().querySelector("#lobby-join-invite")?.addEventListener("click", () => onJoinCode?.(name(), inviteCode));
    card().querySelector("#lobby-quick").addEventListener("click", () => onQuick?.(name(), mode));
    card().querySelector("#lobby-host").addEventListener("click", () => onHost?.(name(), mode));
    const codeInput = card().querySelector("#lobby-code");
    codeInput.addEventListener("input", () => { codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); });
    card().querySelector("#lobby-code-form").addEventListener("submit", (e) => { e.preventDefault(); const code = codeInput.value.trim(); if (code.length >= 4) onJoinCode?.(name(), code); else codeInput.focus(); });
    input.addEventListener("keydown", (e) => e.key === "Enter" && (inviteCode ? onJoinCode?.(name(), inviteCode) : onPlay(name(), mode)));
  },

  showConnecting(text = "FINDING A BAY") {
    root().hidden = false;
    card().classList.remove("menu");
    card().innerHTML = `${title()}<p class="status wait">${esc(text)}<span class="cursor"></span></p>`;
  },

  /**
   * Lobby. Free-for-all lists the four island slots; teams mode shows the two team cards with a
   * "join" button on the other side when it has a free island. Anyone can start early with bots.
   * onReady(bool), onStartNow(), onJoinTeam(team).
   */
  showWaiting({ players, myKey, mode = GameMode.FFA, durations, countdownMs, onReady, onStartNow, onJoinTeam, isHost = false, settings = { bots: 3, minutes: 3 }, onSettings, code = "", isPrivate = false, onLeave }) {
    root().hidden = false;
    card().classList.remove("menu");
    const teams = mode === GameMode.TEAMS;
    const link = code ? `${location.origin}${location.pathname}?code=${code}` : "";
    const codeRow = code ? `<div class="roomcode"><span>${isPrivate ? "PRIVATE ROOM" : "ROOM CODE"}</span><b data-code>${esc(code)}</b><button class="secondary mini" id="lobby-copy" data-link="${esc(link)}">COPY LINK</button></div>` : "";
    const me = players.find((p) => p.key === myKey);
    const sorted = players.slice().sort((a, b) => a.islandIndex - b.islandIndex);
    const row = (p, color) => `<li>${sq(color)}<span class="name">${esc(p.name)}${p.key === myKey ? ' <span class="you">(YOU)</span>' : ""}${p.isHost ? ' <span class="host">HOST</span>' : ""}</span>
        <span class="tag ${p.ready ? "ok" : ""}">${p.ready ? `${pixelIcon("check", 2)}READY` : "..."}</span></li>`;
    const botSlot = () => `<li class="slot">${pixelIcon("bot", 2)}<span class="name">BOT SLOT</span><span class="tag">FILLS AT START</span></li>`;
    let body;
    if (teams) {
      const cards = TEAM_NAMES.map((name, t) => {
        const members = sorted.filter((p) => teamOf(p.islandIndex, mode) === t);
        const free = TEAM_SIZE - members.length;
        const canJoin = me && me.team !== t && free > 0;
        return `<section class="team">
            <header style="background:${teamHex(t)}">${pixelIcon("hero", 2, { R: t === 0 ? "#b53d1a" : "#1f4f9a" })}${esc(name.toUpperCase())}<span class="count">${members.length}/${TEAM_SIZE}</span></header>
            <ul>${members.map((p) => row(p, teamHex(t))).join("")}${Array.from({ length: free }, botSlot).join("")}</ul>
            ${canJoin ? `<div class="join"><button class="secondary mini" data-join="${t}">&#9654; JOIN ${esc(name.split(" ")[0].toUpperCase())}</button></div>` : ""}
          </section>`;
      });
      body = `<div class="teams">${cards[0]}<div class="vs">VS</div>${cards[1]}</div>`;
    } else {
      const bots = Math.min(settings.bots, MAX_PLAYERS - sorted.length);
      body = `<ul class="ffa">${sorted.map((p) => row(p, colorHex(p.islandIndex))).join("")}${Array.from({ length: bots }, botSlot).join("")}</ul>`;
    }
    const humans = players.filter((p) => !p.isBot).length;
    const islands = teams ? MAX_PLAYERS : Math.min(MAX_PLAYERS, Math.max(1, humans + settings.bots));
    const stepper = (key, value, label, min, max, fmt) => `<div class="setting"><span>${label}</span>
        ${isHost ? `<button class="mini secondary" data-set="${key}" data-delta="-1" ${value <= min ? "disabled" : ""}>-</button>` : ""}
        <b>${fmt(value)}</b>
        ${isHost ? `<button class="mini secondary" data-set="${key}" data-delta="1" ${value >= max ? "disabled" : ""}>+</button>` : ""}</div>`;
    const settingsRow = `<div class="settings">
        ${teams ? `<div class="setting"><span>BOTS</span><b>FILL TO 2V2</b></div>` : stepper("bots", settings.bots, "BOTS", 0, Math.min(MAX_BOTS, MAX_PLAYERS - humans), (v) => `${v}`)}
        ${stepper("minutes", settings.minutes, "LENGTH", MIN_MATCH_MINUTES, MAX_MATCH_MINUTES, (v) => `${v} MIN`)}
        <div class="setting"><span>ISLANDS</span><b>${islands}</b></div>
      </div>${isHost ? "" : `<p class="note">THE HOST SETS BOTS AND MATCH LENGTH.</p>`}`;
    const status = countdownMs != null
      ? `<p class="status" data-countdown>STARTING IN ${Math.max(0, Math.ceil(countdownMs / 1000))}</p>`
      : `<p class="status wait" data-countdown>${isPrivate ? (isHost ? "PRESS START WHEN EVERYONE IS IN" : "WAITING FOR THE HOST TO START") : humans < MIN_PLAYERS_TO_START ? "WAITING FOR PLAYERS" : "WAITING FOR READY"}<span class="cursor"></span></p>`;
    const canStart = !isPrivate || isHost;
    card().innerHTML = `
      ${title(true)}
      <p class="sub">${teams ? `${pixelIcon("team", 2)} TEAMS 2V2` : `${pixelIcon("bomb", 2)} FREE FOR ALL`} &middot; PLAYERS <b>${players.length}/${MAX_PLAYERS}</b></p>
      ${codeRow}
      ${body}
      ${settingsRow}
      ${timeline(durations)}
      ${status}
      <div class="row">
        ${canStart ? `<button class="big" id="lobby-start">&#9654; ${isPrivate ? "START MATCH" : "START WITH BOTS"}</button>` : ""}
        <button class="${me?.ready ? "on" : "secondary"}" id="lobby-ready">${me?.ready ? `${pixelIcon("check", 2, { G: "#3a1a10" })}READY` : "READY UP"}</button>
        ${onLeave ? `<button class="secondary mini" id="lobby-leave" title="Back to the menu">LEAVE</button>` : ""}
      </div>
      <p class="note">${teams ? "TEAMMATES SHARE ONE SCORE. JOIN THE OTHER TEAM WHILE IT HAS A FREE ISLAND." : "EVERY ISLAND FOR ITSELF. HIGHEST COIN TOTAL WINS."}</p>`;
    card().querySelector("#lobby-ready").addEventListener("click", () => onReady(!me?.ready));
    card().querySelector("#lobby-start")?.addEventListener("click", () => onStartNow?.());
    card().querySelector("#lobby-leave")?.addEventListener("click", () => onLeave?.());
    const copy = card().querySelector("#lobby-copy");
    copy?.addEventListener("click", async () => {
      const url = copy.dataset.link;
      let ok = false;
      try { await navigator.clipboard.writeText(url); ok = true; } catch { /* clipboard blocked: show the link instead */ }
      if (ok) { copy.textContent = "COPIED!"; setTimeout(() => { copy.textContent = "COPY LINK"; }, 1500); }
      else { const box = document.createElement("input"); box.value = url; box.readOnly = true; box.className = "linkbox"; copy.replaceWith(box); box.select(); }
    });
    card().querySelectorAll("[data-join]").forEach((b) => b.addEventListener("click", () => onJoinTeam?.(Number(b.dataset.join))));
    card().querySelectorAll("[data-set]").forEach((b) => b.addEventListener("click", () => onSettings?.(b.dataset.set, Number(b.dataset.delta)))); // caller adds the delta to live state
  },

  setCountdown(ms) {
    const c = card().querySelector("[data-countdown]");
    if (c && !c.classList.contains("wait")) c.textContent = `STARTING IN ${Math.max(0, Math.ceil(ms / 1000))}`;
  },

  /** Final standings. Free-for-all ranks players; teams mode ranks the two teams and lists members under each. */
  showResults({ ranked, myKey, mode = GameMode.FFA, nextRoundMs = 0, onLeave }) {
    root().hidden = false;
    card().classList.remove("menu");
    const place = ["1ST", "2ND", "3RD", "4TH"];
    const rankColor = ["#ffd23f", "#cfd8dc", "#d19a5a", "#a9d6e6"];
    const rankTag = (rank) => `<span class="rank" style="color:${rankColor[rank - 1] ?? "#fff"}">${place[rank - 1] ?? rank}</span>`;
    const coins = (n) => `<span class="coins"><i class="coin"></i>${n}</span>`;
    const member = (p, color, withRank = true) => `<li>${withRank ? rankTag(p.rank) : ""}${sq(color)}<span class="name">${esc(p.name)}${p.isBot ? " [BOT]" : ""}${p.key === myKey ? ' <span class="you">(YOU)</span>' : ""}</span>${coins(p.coins)}</li>`;
    const me = ranked.find((p) => p.key === myKey);
    let rows, heading, sub;
    if (mode === GameMode.TEAMS) {
      const teams = rankTeams(ranked, mode);
      const mine = teams.find((t) => t.members.some((p) => p.key === myKey));
      rows = teams.map((t) => `<li class="teamrow" style="background:${teamHex(t.team)}">${rankTag(t.rank)}${t.rank === 1 ? pixelIcon("crown", 2) : ""}${esc((TEAM_NAMES[t.team] ?? `Team ${t.team + 1}`).toUpperCase())}${coins(t.coins)}</li>${t.members.map((p) => member(p, teamHex(t.team), false)).join("")}`).join("");
      const draw = teams.filter((t) => t.rank === 1).length > 1;
      heading = mine?.rank === 1 ? (draw ? "DRAW!" : "YOUR TEAM WINS!") : "MATCH OVER";
      sub = mine ? `${esc(TEAM_NAMES[mine.team].toUpperCase())} FINISHED <b>${place[mine.rank - 1] ?? mine.rank}</b>` : "";
    } else {
      rows = ranked.map((p) => member(p, colorHex(p.islandIndex))).join("");
      const leaders = ranked.filter((p) => p.rank === 1).length;
      heading = me?.rank === 1 ? (leaders > 1 ? "DRAW!" : "YOU WIN!") : "MATCH OVER";
      sub = me ? `YOU FINISHED <b>${place[me.rank - 1] ?? me.rank}</b>` : "";
    }
    card().innerHTML = `
      <h1 class="small">${me?.rank === 1 || heading.includes("WINS") ? pixelIcon("crown", 3) : pixelIcon("bomb", 3)}${heading}</h1>
      <p class="sub">${sub}</p>
      <ul class="ffa">${rows}</ul>
      <p class="status" data-next>NEXT ROUND IN ${Math.max(0, Math.ceil(nextRoundMs / 1000))}</p>
      <div class="row"><button class="secondary" id="lobby-leave">LEAVE TO MENU</button></div>
      <p class="note">EVERYONE HERE STAYS TOGETHER FOR THE NEXT ROUND. NEW ISLANDS, SAME CREW.</p>`;
    card().querySelector("#lobby-leave").addEventListener("click", onLeave);
  },

  setNextRound(ms) {
    const n = card().querySelector("[data-next]");
    if (n) n.textContent = `NEXT ROUND IN ${Math.max(0, Math.ceil(ms / 1000))}`;
  },

  showError(message, onRetry) {
    root().hidden = false;
    card().classList.remove("menu");
    card().innerHTML = `${title()}<p class="err">${esc(message)}</p><div class="row"><button id="lobby-retry">TRY AGAIN</button></div>`;
    card().querySelector("#lobby-retry").addEventListener("click", onRetry);
  },

  hide() {
    root().hidden = true;
  },
};

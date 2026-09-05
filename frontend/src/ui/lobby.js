import { CTF_HOLD_TO_WIN_MS, GameMode, GAMES, GAME_LIST, GameType, gameName, normalizeGame, MAPS, MAP_LIST, mapName, normalizeMap, MAX_BOTS, MAX_MATCH_MINUTES, MAX_PLAYERS, MIN_MATCH_MINUTES, MIN_PLAYERS_TO_START, PLAYER_COLORS, TEAM_COLORS, TEAM_NAMES, TEAM_SIZE, BUILD_PHASE_DURATION, COMBAT_PHASE_DURATION, rankTeams, teamOf } from "@kaboom-bay/shared";

const hex = (c) => `#${c.toString(16).padStart(6, "0")}`;
const colorHex = (i) => hex(PLAYER_COLORS[i % PLAYER_COLORS.length]);
const teamHex = (t) => hex(TEAM_COLORS[t % TEAM_COLORS.length]);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const MODE_KEY = "kaboom-mode";
export const savedMode = () => { try { return localStorage.getItem(MODE_KEY) === GameMode.TEAMS ? GameMode.TEAMS : GameMode.FFA; } catch { return GameMode.FFA; } };
const saveMode = (m) => { try { localStorage.setItem(MODE_KEY, m); } catch { /* private mode */ } };
const GAME_KEY = "kaboom-game";
export const savedGame = () => { try { return normalizeGame(localStorage.getItem(GAME_KEY)); } catch { return normalizeGame(null); } };
const saveGame = (g) => { try { localStorage.setItem(GAME_KEY, g); } catch { /* private mode */ } };
const MAP_KEY = "kaboom-map";
export const savedMap = () => { try { return normalizeMap(localStorage.getItem(MAP_KEY)); } catch { return normalizeMap(null); } };
const saveMap = (m) => { try { localStorage.setItem(MAP_KEY, m); } catch { /* private mode */ } };

const ADJ = ["Sandy", "Salty", "Sunny", "Coco", "Mango", "Breezy", "Tiki", "Lagoon", "Coral", "Palm"];
const NOUN = ["Crab", "Parrot", "Turtle", "Gecko", "Pelican", "Dolphin", "Monkey", "Toucan", "Iguana", "Puffer"];
export const randomName = () => `${ADJ[(Math.random() * ADJ.length) | 0]} ${NOUN[(Math.random() * NOUN.length) | 0]}`;

// ---------- pixel-art icons drawn with box-shadow (no image files) ----------
const PAL = { B: "#3b414d", W: "#9aa3b4", X: "#ffd23f", O: "#ff6b3d", R: "#ff5c5c", L: "#4da3ff", S: "#f6c9a0", Y: "#ffd23f", G: "#62d26f", M: "#a9d6e6", D: "#062a3a", K: "#0f3446",
  N: "#8c5a2e", P: "#9a7cff", C: "#3ee6d6", T: "#ffffff", A: "#3a2a2e", F: "#f1d48e", I: "#bfe6f5" };
const ICONS = {
  bomb: ["...OX...", "....O...", "..BBBB..", ".BWWBBB.", "BWBBBBBB", "BBBBBBBB", ".BBBBBB.", "..BBBB.."],
  team: ["........", ".RR..LL.", "RSSRLSSL", "RSSRLSSL", ".RR..LL.", ".RRR.LLL", ".RRR.LLL", "........"],
  bolt: ["....YY..", "...YY...", "..YY....", ".YYYYY..", "...YY...", "..YY....", ".YY.....", "YY......"],
  check: ["......GG", ".....GG.", "....GG..", "GG.GG...", ".GGG....", "..G....."],
  bot: ["...M....", ".MMMMMM.", ".MDMMDM.", ".MMMMMM.", "..MMMM..", ".M.MM.M."],
  crown: ["Y..Y..Y.", "YY.Y.YY.", "YYYYYYY.", "YYYYYYY.", ".YYYYY.."],
  hourglass: ["MMMMMM..", ".MXXM...", ".MXXM...", "..MM....", ".M..M...", ".MXXM...", "MMMMMM.."],
  hero: ["..SSSS..", "..SDSD..", "..SSSS..", ".RRRRRR.", "..RRRR..", "..D..D.."],
  // map cards
  island: ["..GG.GG.", ".GGGGGGG", "GG.GN.GG", "....N...", "....N...", "...FN...", ".FFFFFF.", "LLLLLLLL"],
  volcano: ["...OO...", "...XX...", "..AOOA..", "..AAAA..", ".AAOAAA.", ".AAAAAA.", "AAAAAAAA", "OOOOOOOO"],
  ice: ["T..T..T.", ".T.T.T..", "..TTT...", "TTTTTTT.", "..TTT...", ".T.T.T..", "T..T..T.", "IIIIIIII"],
  space: ["........", "..PPPP..", ".PPCPPP.", "CCCCCCCC", ".PPPPCP.", "..PPPP..", "....T...", ".T......"],
  flag: ["N.......", "NXXXX...", "NXXXXXX.", "NXXXXX..", "NXXXX...", "NXX.....", "N.......", "N......."],
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
    #lobby { position:fixed; inset:0; height:100%; height:var(--vh, 100dvh); display:grid; place-items:stretch; padding:8px; overflow:hidden; pointer-events:auto; font-family:"Press Start 2P", monospace; color:#f3f7f9;
      background:
        repeating-conic-gradient(rgba(3,20,32,.22) 0 25%, transparent 0 50%) 0 0 / 6px 6px,
        radial-gradient(ellipse at 50% 35%, rgba(6,40,60,.25), rgba(4,25,40,.78));
      image-rendering: pixelated; }
    #lobby[hidden] { display:none; }
    #lobby * { box-sizing:border-box; }
    #lobby .pxicon { display:inline-block; position:relative; vertical-align:middle; flex:none; }
    #lobby .pxicon i { position:absolute; left:0; top:0; display:block; }
    /* the panel fills the screen: frame, wood, sand and card are all full height, the card lays its rows out as a column */
    #lobby .frame { position:relative; filter: drop-shadow(0 10px 0 rgba(3,20,32,.6)); width:100%; height:100%; max-width:1500px; margin:0 auto; }
    #lobby .wood, #lobby .sand { height:100%; }
    #lobby .wood { background:#6d4320; padding:6px;
      clip-path: polygon(9px 0, calc(100% - 9px) 0, 100% 9px, 100% calc(100% - 9px), calc(100% - 9px) 100%, 9px 100%, 0 calc(100% - 9px), 0 9px); }
    #lobby .sand { background:#f1d48e; padding:4px;
      clip-path: polygon(6px 0, calc(100% - 6px) 0, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 0 calc(100% - 6px), 0 6px); }
    #lobby .card { background:#0f3446; padding:14px 18px 16px; width:100%; height:100%; display:flex; flex-direction:column; justify-content:center; overflow:auto; text-align:center;
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
    #lobby button { font:9px/1 "Press Start 2P", monospace; letter-spacing:1px; text-transform:uppercase; padding:11px 14px 9px; cursor:pointer; color:#0d3b1a;
      background:#62d26f; border:3px solid #0d3b1a; box-shadow: 0 6px 0 #2e9e4f, 0 6px 0 3px #0d3b1a; transition: transform .05s, box-shadow .05s;
      display:inline-flex; align-items:center; justify-content:center; gap:10px; }
    #lobby button:hover { background:#78e085; }
    #lobby button:active { transform:translateY(5px); box-shadow: 0 1px 0 #2e9e4f, 0 1px 0 3px #0d3b1a; }
    #lobby button:focus-visible { outline:3px solid #ffd23f; outline-offset:3px; }
    #lobby button.big { font-size:11px; padding:13px 22px 11px; }
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
    #lobby .modes.games { margin-bottom:12px; } #lobby .modes.games button { padding:9px 8px 8px; gap:6px; font-size:9px; }
    #lobby .modes button { flex-direction:column; gap:8px; font-size:10px; padding:12px 8px 10px; background:#082130; color:#a9d6e6; border-color:#1a4a5f; box-shadow: 0 4px 0 #041520, 0 4px 0 3px #1a4a5f; }
    #lobby .modes button small { font-size:7px; color:#7fb6c9; letter-spacing:0; text-transform:none; line-height:1.6; }
    #lobby .modes button.on { background:#1fb6dc; color:#062a3a; border-color:#062a3a; box-shadow: 0 4px 0 #0e7fa3, 0 4px 0 3px #062a3a; }
    #lobby .modes button.on small { color:#0a3d4f; }
    /* map picker: one card per map, sky over ground in the map's own colours */
    #lobby .maps { display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; margin:0 0 14px; }
    #lobby .maps button, #lobby .maps button:hover, #lobby .maps button.on { background: linear-gradient(180deg, var(--sky) 0 64%, var(--ground) 64% 100%); }
    #lobby .maps button { flex-direction:column; gap:6px; font-size:8px; padding:10px 4px 8px; color:var(--ink); text-shadow:1px 1px 0 rgba(0,0,0,.35); border-color:#062a3a; box-shadow: 0 4px 0 #041520, 0 4px 0 3px #062a3a; opacity:.7; }
    #lobby .maps button small { font-size:6px; letter-spacing:0; text-transform:none; line-height:1.5; color:var(--ink); opacity:.9; }
    #lobby .maps button .pxicon { filter: drop-shadow(1px 1px 0 rgba(0,0,0,.6)); }
    #lobby .maps button:hover { opacity:.9; }
    #lobby .maps button.on { opacity:1; border-color:#ffd23f; box-shadow: 0 4px 0 #b58a1a, 0 4px 0 3px #ffd23f; }
    #lobby .maps button.on span { color:#ffd23f; text-shadow:1px 1px 0 rgba(0,0,0,.7); }
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
    #lobby .cols { display:contents; }
    /* menu: title + name in one row, three carousels, one row of buttons */
    #lobby .menu .head { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:8px; text-align:left; }
    #lobby .menu .head h1 { margin:0; font-size:16px; }
    #lobby .menu .namebox { display:flex; align-items:center; gap:8px; }
    #lobby .menu .namebox .label { margin:0; }
    #lobby .menu .namebox input { width:200px; margin:0; padding:9px 8px 7px; font-size:10px; }
    #lobby .menu { justify-content:flex-start; }
    #lobby .cars { display:grid; grid-template-columns:1fr 1fr 1.2fr; gap:10px; margin:0 0 10px; flex:1; min-height:0; }
    #lobby .car { display:flex; flex-direction:column; min-height:0; }
    #lobby .car-body { flex:1; min-height:0; }
    #lobby .car .label { text-align:center; margin:0 0 4px; }
    #lobby .car-body { display:flex; align-items:stretch; gap:4px; }
    #lobby .car .arr { flex:none; width:30px; padding:0; font-size:10px; background:#082130; color:#a9d6e6; border-color:#1a4a5f; box-shadow: 0 3px 0 #041520, 0 3px 0 3px #1a4a5f; }
    #lobby .car .arr:hover { background:#0f3446; }
    #lobby .car-view { flex:1; min-width:0; touch-action:pan-y; cursor:pointer; user-select:none; }
    #lobby .car-item { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:5px; height:100%; min-height:84px; padding:8px 6px; border:3px solid #062a3a; box-shadow: 0 4px 0 #041520; background:#082130; color:#a9d6e6; font-size:9px; letter-spacing:1px; text-align:center; }
    #lobby .car-item small { font-size:7px; color:#7fb6c9; letter-spacing:0; text-transform:none; line-height:1.5; }
    #lobby .car-item.mode, #lobby .car-item.game { background:#1fb6dc; color:#062a3a; } #lobby .car-item.mode small, #lobby .car-item.game small { color:#0a3d4f; }
    #lobby .car-item.map { background: linear-gradient(180deg, var(--sky) 0 60%, var(--ground) 60% 100%); color:var(--ink); text-shadow:1px 1px 0 rgba(0,0,0,.45); border-color:#ffd23f; }
    #lobby .car-item.map small { color:var(--ink); opacity:.9; }
    #lobby .car-item .pxicon { filter: drop-shadow(1px 1px 0 rgba(0,0,0,.4)); }
    #lobby .car-view.slide .car-item { animation: slidein .18s ease-out; }
    @keyframes slidein { from { transform:translateX(12px); opacity:.4; } to { transform:none; opacity:1; } }
    #lobby .dots { display:flex; justify-content:center; gap:6px; margin-top:6px; }
    #lobby .dots .dot { width:10px; height:10px; padding:0; border:2px solid #062a3a; background:#1a4a5f; box-shadow:none; }
    #lobby .dots .dot.on { background:#ffd23f; }
    #lobby .dots .dot:active { transform:none; }
    /* roomy screens (desktop): bigger carousel cards so the menu fills the width it has */
    @media (min-height: 600px) and (min-width: 900px) {
      #lobby .car-item { min-height:150px; font-size:12px; gap:10px; }
      #lobby .car-item .pxicon { transform:scale(1.8); margin:14px 0; }
      #lobby .car-item small { font-size:8px; }
      #lobby .car .arr { width:38px; font-size:12px; }
      #lobby .menu .head h1 { font-size:22px; }
      #lobby .row.actions button.big { font-size:12px; padding:14px 26px 12px; }
    }
    #lobby .row.actions { gap:8px; }
    #lobby .row.actions form.code input { width:96px; padding:10px 6px 8px; font-size:10px; }
    #lobby .row.actions form.code button { padding:10px 12px 8px; font-size:9px; }
    /* waiting card: players left, settings and buttons right, on every screen */
    #lobby .wait { justify-content:flex-start; }
    #lobby .wait .cols { display:grid; grid-template-columns:1.1fr 1fr; gap:0 14px; align-items:start; flex:1; min-height:0; align-content:start; }
    #lobby .wait .cols .col:last-child { align-self:stretch; display:flex; flex-direction:column; justify-content:center; }
    #lobby .wait li { min-height:30px; padding:6px 9px 5px; }
    #lobby .wait .settings { margin:0 0 6px; }
    #lobby .wait .status { margin:6px 0 8px; }
    @media (max-height: 500px) {
      #lobby .card { padding:10px 12px 10px; }
      #lobby h1 { font-size:18px; margin-bottom:4px; }
      #lobby h1.small { font-size:14px; margin-bottom:6px; }
      #lobby .sub { margin-bottom:8px; }
      #lobby .note, #lobby .label { display:none; }
      #lobby input { margin-bottom:8px; padding:9px 8px 7px; }
      #lobby .modes { margin-bottom:10px; }
      #lobby .modes button { padding:8px 6px 6px; }
      #lobby .modes.games { margin-bottom:8px; } #lobby .modes.games button small { display:none; }
      /* landscape phones: everything shrinks a notch; the carousels keep the menu to one screen */
      #lobby .menu { padding:8px 10px 8px; }
      #lobby .menu .head { margin-bottom:6px; } #lobby .menu .head h1 { font-size:12px; } #lobby .menu .head h1 .pxicon { display:none; }
      #lobby .menu .namebox input { width:150px; padding:7px 6px 5px; font-size:9px; }
      #lobby .cars { gap:6px; margin-bottom:6px; }
      #lobby .car .label { display:block; font-size:7px; margin-bottom:2px; }
      #lobby .car-item { min-height:64px; padding:5px 4px; gap:3px; font-size:8px; } #lobby .car-item small { font-size:6px; }
      #lobby .car-item .pxicon { transform:scale(.75); margin:-3px 0; }
      #lobby .car .arr { width:24px; font-size:8px; }
      #lobby .dots { margin-top:4px; } #lobby .dots .dot { width:8px; height:8px; }
      #lobby .row.actions { gap:6px; } #lobby .menu button.big { font-size:9px; padding:9px 12px 7px; } #lobby .menu button.quick, #lobby .menu #lobby-host, #lobby .row.actions form.code button { padding:8px 9px 6px; font-size:8px; }
      #lobby .row.actions form.code input { width:80px; padding:7px 4px 5px; font-size:9px; }
      /* landscape phones: the waiting card is two columns too (players left, settings and buttons right) */
      #lobby .wait .cols { display:grid; grid-template-columns:1.1fr 1fr; gap:0 12px; align-items:start; }
      #lobby .wait { padding:8px 12px 8px; }
      #lobby .wait h1.small { font-size:12px; margin-bottom:2px; } #lobby .wait .sub { margin-bottom:6px; font-size:7px; }
      #lobby .wait ul.ffa { margin:0 0 4px; } #lobby .wait li { min-height:22px; padding:3px 6px 2px; font-size:8px; }
      #lobby .wait .teams { margin:0; gap:6px; }
      #lobby .wait .settings { margin:0 0 4px; gap:5px; } #lobby .wait .setting { padding:3px 6px; font-size:7px; } #lobby .wait .setting b { font-size:9px; min-width:40px; }
      #lobby .wait .status { margin:4px 0; font-size:9px; }
      #lobby .wait .row { flex-wrap:wrap; gap:6px; }
      #lobby .wait button.big { font-size:9px; padding:9px 12px 8px; } #lobby .wait #lobby-ready { font-size:9px; padding:9px 12px 8px; }
      #lobby .wait .note { display:none; }
      #lobby .maps { margin-bottom:8px; gap:6px; }
      #lobby .maps button { padding:6px 4px 5px; gap:4px; }
      #lobby .maps button small { display:none; }
      #lobby .timeline { margin:8px 0 4px; }
      #lobby .timeline > div { padding:4px 4px 3px; font-size:7px; } #lobby .timeline > div b { font-size:9px; margin-top:2px; }
      #lobby .menu .timeline, #lobby .invite { display:none; }
      #lobby .friends { margin-top:8px; }
      #lobby .row { gap:8px; }
      #lobby form.code input { padding:9px 6px 7px; width:96px; }
      #lobby form.code button, #lobby button.quick, #lobby #lobby-host { padding:10px 12px 8px; font-size:9px; }
      #lobby .status { margin:6px 0 8px; font-size:10px; }
      /* landscape phones (390px tall): the waiting card must fit without scrolling so READY / START stay reachable */
      #lobby { padding:5px; }
      #lobby h1.small { font-size:12px; margin-bottom:4px; }
      #lobby li { min-height:24px; padding:3px 8px 2px; }
      #lobby .roomcode { margin:0 0 6px; padding:4px 8px; } #lobby .roomcode b { font-size:12px; }
      #lobby .settings { margin:6px 0 0; } #lobby .setting { padding:4px 8px; }
      #lobby .timeline { display:none; } /* LENGTH in the settings row already shows the match length */
      #lobby .status { margin:4px 0 6px; min-height:0; }
      #lobby button.big { font-size:11px; padding:12px 18px 10px; }
      #lobby button { padding:11px 14px 9px; }
    }
    @media (max-width: 560px) {
      #lobby .card { padding:16px 14px 18px; min-width:0; }
      #lobby h1 { font-size:20px; }
      #lobby .teams { grid-template-columns:1fr; }
      #lobby .vs { display:none; }
      #lobby .maps { grid-template-columns:repeat(2, 1fr); gap:6px; }
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
function timeline({ buildMs = BUILD_PHASE_DURATION, combatMs = COMBAT_PHASE_DURATION } = {}, game = null) {
  if (normalizeGame(game) === GameType.CTF) return `<div class="timeline" aria-label="How to win"><div class="c" style="border-left:3px solid #062a3a">HOLD THE FLAG<b>${mmss(CTF_HOLD_TO_WIN_MS)}</b></div><div class="r">NO CLOCK<b>&#9873;</b></div></div>`;
  return `<div class="timeline" aria-label="Match length">
      <div class="b">BUILD<b>${mmss(buildMs)}</b></div>
      <div class="c">COMBAT<b>${mmss(combatMs)}</b></div>
      <div class="r">TOTAL<b>${mmss(buildMs + combatMs)}</b></div>
    </div>`;
}

export const lobby = {
  /**
   * Main menu: name, mode (free-for-all or 2v2 teams), map (island / volcano / ice / space), then Play (in
   * that mode on that map), Quick Join (any bay on that map with people already waiting) or Host.
   * onPlay(name, mode, map), onQuick(name, mode, map), onHost(name, mode, map), onJoinCode(name, code).
   */
  /**
   * Main menu, full width: name, three carousels (mode, game, map) side by side, then one row of buttons.
   * Arrows, swipes and the dots pick an entry. onPlay(name, mode, map, game), onQuick(...), onHost(...), onJoinCode(name, code).
   */
  showMenu({ defaultName, defaultMode = savedMode(), defaultMap = savedMap(), defaultGame = savedGame(), inviteCode = null, onPlay, onQuick, onHost, onJoinCode }) {
    root().hidden = false;
    card().classList.remove("wait");
    document.documentElement.style.backgroundColor = "#0f3446"; // the menu's own navy behind everything (a match sets the map's sky)
    const picks = {
      mode: { value: defaultMode === GameMode.TEAMS ? GameMode.TEAMS : GameMode.FFA, save: saveMode, items: [
        { id: GameMode.FFA, title: "FREE FOR ALL", sub: "You vs 3 rivals", icon: "bomb" },
        { id: GameMode.TEAMS, title: "TEAMS 2V2", sub: "Team up with a friend", icon: "team" }] },
      game: { value: normalizeGame(defaultGame), save: saveGame, items: GAME_LIST.map((g) => ({ id: g, title: GAMES[g].name.toUpperCase(), sub: GAMES[g].tagline, icon: g === GameType.CTF ? "flag" : "bomb" })) },
      map: { value: normalizeMap(defaultMap), save: saveMap, items: MAP_LIST.map((m) => ({ id: m, title: MAPS[m].name.toUpperCase(), sub: MAPS[m].tagline, icon: m, style: `--sky:${MAPS[m].sky};--ground:${MAPS[m].ground};--ink:${MAPS[m].ink}` })) },
    };
    const carousel = (key, label) => `<div class="car" data-car="${key}"><span class="label">${label}</span>
        <div class="car-body"><button type="button" class="arr" data-prev="${key}" aria-label="Previous ${label.toLowerCase()}">&#9664;</button><div class="car-view" data-view="${key}"></div><button type="button" class="arr" data-next="${key}" aria-label="Next ${label.toLowerCase()}">&#9654;</button></div>
        <div class="dots" data-dots="${key}"></div></div>`;
    card().classList.add("menu");
    card().innerHTML = `
      <div class="head">${title(true)}<div class="namebox"><span class="label">YOUR NAME</span><input id="lobby-name" maxlength="12" value="${esc(defaultName)}" aria-label="Your name" spellcheck="false" autocomplete="off" /></div></div>
      <div class="cars">${carousel("mode", "GAME MODE")}${carousel("game", "GAME")}${carousel("map", "MAP")}</div>
      ${inviteCode ? `<div class="invite">${pixelIcon("bolt", 2)} INVITED TO ROOM <b>${esc(inviteCode)}</b></div>` : ""}
      <div class="row actions">
        ${inviteCode ? `<button class="big" id="lobby-join-invite">&#9654; JOIN ${esc(inviteCode)}</button>` : `<button class="big" id="lobby-play">&#9654; PLAY</button>`}
        <button class="quick" id="lobby-quick" title="Join any bay where players are already waiting">${pixelIcon("bolt", 2)}QUICK JOIN</button>
        <button class="secondary" id="lobby-host" title="Open a private room and share its code or link">${pixelIcon("team", 2)}HOST ROOM</button>
        <form class="code" id="lobby-code-form" autocomplete="off"><input id="lobby-code" maxlength="5" placeholder="CODE" aria-label="Room code" spellcheck="false" value="${inviteCode ? esc(inviteCode) : ""}" /><button class="secondary" type="submit">JOIN</button></form>
      </div>
      <p class="note">PLAY MATCHES YOU WITH STRANGERS. HOST A ROOM TO PLAY WITH FRIENDS: THEY JOIN WITH YOUR CODE OR LINK. EMPTY ISLANDS ARE FILLED BY BOTS.</p>`;
    const paint = (key) => {
      const pick = picks[key], i = pick.items.findIndex((it) => it.id === pick.value), it = pick.items[i];
      const view = card().querySelector(`[data-view="${key}"]`);
      view.innerHTML = `<div class="car-item ${key}" data-${key}="${it.id}" style="${it.style ?? ""}">${pixelIcon(it.icon, 3)}<b>${esc(it.title)}</b><small>${esc(it.sub)}</small></div>`;
      card().querySelector(`[data-car="${key}"]`).dataset.value = it.id;
      card().querySelector(`[data-dots="${key}"]`).innerHTML = pick.items.map((x) => `<button type="button" class="dot ${x.id === it.id ? "on" : ""}" data-${key}-dot="${x.id}" aria-label="${esc(x.title)}"></button>`).join("");
      card().querySelectorAll(`[data-${key}-dot]`).forEach((d) => d.addEventListener("click", () => { pick.value = d.dataset[`${key}Dot`]; pick.save(pick.value); paint(key); }));
      view.classList.remove("slide"); void view.offsetWidth; view.classList.add("slide");
    };
    const step = (key, dir) => { const pick = picks[key], n = pick.items.length, i = pick.items.findIndex((it) => it.id === pick.value); pick.value = pick.items[(i + dir + n) % n].id; pick.save(pick.value); paint(key); };
    for (const key of Object.keys(picks)) {
      paint(key);
      card().querySelector(`[data-prev="${key}"]`).addEventListener("click", () => step(key, -1));
      card().querySelector(`[data-next="${key}"]`).addEventListener("click", () => step(key, 1));
      const view = card().querySelector(`[data-view="${key}"]`);
      let x0 = null;
      view.addEventListener("pointerdown", (e) => { x0 = e.clientX; });
      view.addEventListener("pointerup", (e) => { if (x0 === null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 24) step(key, dx < 0 ? 1 : -1); else step(key, 1); }); // swipe either way, tap advances
    }
    const input = card().querySelector("#lobby-name");
    const name = () => input.value.trim() || defaultName;
    const chosen = () => [picks.mode.value, picks.map.value, picks.game.value];
    card().querySelector("#lobby-play")?.addEventListener("click", () => onPlay(name(), ...chosen()));
    card().querySelector("#lobby-join-invite")?.addEventListener("click", () => onJoinCode?.(name(), inviteCode));
    card().querySelector("#lobby-quick").addEventListener("click", () => onQuick?.(name(), ...chosen()));
    card().querySelector("#lobby-host").addEventListener("click", () => onHost?.(name(), ...chosen()));
    const codeInput = card().querySelector("#lobby-code");
    codeInput.addEventListener("input", () => { codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); });
    card().querySelector("#lobby-code-form").addEventListener("submit", (e) => { e.preventDefault(); const code = codeInput.value.trim(); if (code.length >= 4) onJoinCode?.(name(), code); else codeInput.focus(); });
    input.addEventListener("keydown", (e) => e.key === "Enter" && (inviteCode ? onJoinCode?.(name(), inviteCode) : onPlay(name(), ...chosen())));
  },

  showConnecting(text = "FINDING A BAY") {
    root().hidden = false;
    card().classList.remove("menu", "wait");
    card().innerHTML = `${title()}<p class="status wait">${esc(text)}<span class="cursor"></span></p>`;
  },

  /**
   * Lobby. Free-for-all lists the four island slots; teams mode shows the two team cards with a
   * "join" button on the other side when it has a free island. Anyone can start early with bots.
   * onReady(bool), onStartNow(), onJoinTeam(team).
   */
  showWaiting({ players, myKey, mode = GameMode.FFA, map = null, game = null, durations, countdownMs, onReady, onStartNow, onJoinTeam, isHost = false, settings = { bots: 3, minutes: 3 }, onSettings, code = "", isPrivate = false, onLeave }) {
    root().hidden = false;
    card().classList.remove("menu", "wait");
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
        ${normalizeGame(game) === GameType.CTF ? `<div class="setting"><span>TO WIN</span><b>HOLD ${mmss(CTF_HOLD_TO_WIN_MS)}</b></div>` : stepper("minutes", settings.minutes, "LENGTH", MIN_MATCH_MINUTES, MAX_MATCH_MINUTES, (v) => `${v} MIN`)}
        <div class="setting"><span>ISLANDS</span><b>${islands}</b></div>
      </div>${isHost ? "" : `<p class="note">THE HOST SETS BOTS AND MATCH LENGTH.</p>`}`;
    const status = countdownMs != null
      ? `<p class="status" data-countdown>STARTING IN ${Math.max(0, Math.ceil(countdownMs / 1000))}</p>`
      : `<p class="status wait" data-countdown>${isPrivate ? (isHost ? "PRESS START WHEN EVERYONE IS IN" : "WAITING FOR THE HOST TO START") : humans < MIN_PLAYERS_TO_START ? "WAITING FOR PLAYERS" : "WAITING FOR READY"}<span class="cursor"></span></p>`;
    const canStart = !isPrivate || isHost;
    card().classList.add("wait");
    card().innerHTML = `
      ${title(true)}
      <p class="sub">${teams ? `${pixelIcon("team", 2)} TEAMS 2V2` : `${pixelIcon("bomb", 2)} FREE FOR ALL`} &middot; ${pixelIcon(normalizeGame(game) === GameType.CTF ? "flag" : "bomb", 2)} ${esc(gameName(game).toUpperCase())} &middot; ${pixelIcon(normalizeMap(map), 2)} ${esc(mapName(map).toUpperCase())} &middot; PLAYERS <b>${players.length}/${MAX_PLAYERS}</b></p>
      <div class="cols"><div class="col">
      ${codeRow}
      ${body}
      </div><div class="col">
      ${settingsRow}
      ${timeline(durations, game)}
      ${status}
      <div class="row">
        ${canStart ? `<button class="big" id="lobby-start">&#9654; ${isPrivate ? "START MATCH" : "START WITH BOTS"}</button>` : ""}
        <button class="${me?.ready ? "on" : "secondary"}" id="lobby-ready">${me?.ready ? `${pixelIcon("check", 2, { G: "#3a1a10" })}READY` : "READY UP"}</button>
        ${onLeave ? `<button class="secondary mini" id="lobby-leave" title="Back to the menu">LEAVE</button>` : ""}
      </div>
      </div></div>
      <p class="note">${normalizeGame(game) === GameType.CTF ? `HOLD THE FLAG FOR ${mmss(CTF_HOLD_TO_WIN_MS)} IN TOTAL TO WIN. DROPPED FLAGS STAY WHERE THEY FALL. ` : ""}${teams ? "TEAMMATES SHARE ONE SCORE. JOIN THE OTHER TEAM WHILE IT HAS A FREE ISLAND." : "EVERY ISLAND FOR ITSELF. HIGHEST COIN TOTAL WINS."}</p>`;
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
  showResults({ ranked, myKey, mode = GameMode.FFA, map = null, game = null, nextRoundMs = 0, onLeave }) {
    const ctf = normalizeGame(game) === GameType.CTF, key = ctf ? "holdMs" : "coins";
    root().hidden = false;
    card().classList.remove("menu", "wait");
    const place = ["1ST", "2ND", "3RD", "4TH"];
    const rankColor = ["#ffd23f", "#cfd8dc", "#d19a5a", "#a9d6e6"];
    const rankTag = (rank) => `<span class="rank" style="color:${rankColor[rank - 1] ?? "#fff"}">${place[rank - 1] ?? rank}</span>`;
    const coins = (n) => (ctf ? `<span class="coins">&#9873; ${mmss(n)}</span>` : `<span class="coins"><i class="coin"></i>${n}</span>`);
    const member = (p, color, withRank = true) => `<li>${withRank ? rankTag(p.rank) : ""}${sq(color)}<span class="name">${esc(p.name)}${p.isBot ? " [BOT]" : ""}${p.key === myKey ? ' <span class="you">(YOU)</span>' : ""}</span>${coins(p[key])}</li>`;
    const me = ranked.find((p) => p.key === myKey);
    let rows, heading, sub;
    if (mode === GameMode.TEAMS) {
      const teams = rankTeams(ranked, mode, key);
      const mine = teams.find((t) => t.members.some((p) => p.key === myKey));
      rows = teams.map((t) => `<li class="teamrow" style="background:${teamHex(t.team)}">${rankTag(t.rank)}${t.rank === 1 ? pixelIcon("crown", 2) : ""}${esc((TEAM_NAMES[t.team] ?? `Team ${t.team + 1}`).toUpperCase())}${coins(t[key])}</li>${t.members.map((p) => member(p, teamHex(t.team), false)).join("")}`).join("");
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
      <p class="note">EVERYONE HERE STAYS TOGETHER FOR THE NEXT ROUND ON ${esc(mapName(map).toUpperCase())}. NEW ISLANDS, SAME CREW.</p>`;
    card().querySelector("#lobby-leave").addEventListener("click", onLeave);
  },

  setNextRound(ms) {
    const n = card().querySelector("[data-next]");
    if (n) n.textContent = `NEXT ROUND IN ${Math.max(0, Math.ceil(ms / 1000))}`;
  },

  showError(message, onRetry) {
    root().hidden = false;
    card().classList.remove("menu", "wait");
    card().innerHTML = `${title()}<p class="err">${esc(message)}</p><div class="row"><button id="lobby-retry">TRY AGAIN</button></div>`;
    card().querySelector("#lobby-retry").addEventListener("click", onRetry);
  },

  hide() {
    root().hidden = true;
  },
};

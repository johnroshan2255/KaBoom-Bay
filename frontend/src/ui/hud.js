import { GameMode, PLAYER_COLORS, TEAM_COLORS, TEAM_NAMES, rankTeams } from "@kaboom-bay/shared";

/** Minimal DOM HUD shared by the sandbox and the online match. Works on touch. */
const root = () => document.getElementById("ui");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const LOADING_TIPS = [
  "Drag THROW to aim, let go to lob. A quick tap throws straight ahead.",
  "A bomb blows 10 seconds after you pick it up, wherever it is by then.",
  "Throw a live bomb back off your island for +10 coins.",
  "Every terrain block you blow up is a coin. Buildings pay 5 a piece.",
  "Supply crates drop Mega, Cluster and Impact bombs. Walk over one to grab it.",
  "Walls, roofs and beams soak up blasts. Build cover before combat starts.",
  "Space (JUMP on touch) hops two blocks: climb walls, ruins and your own builds.",
  "Capture the Flag: cross your bridge, grab the flag at the hub and carry it home for +50.",
  "Bombed bridges grow back in a few seconds. Bombed heroes respawn on their beach.",
  "Four maps: Island Bay, Volcano, Ice Floe and Deep Space. Pick one in the menu.",
  "Holding a bomb until it pops costs you 15 coins. Throw early!",
  "Blasts knock heroes around. Stand back from your own island's edge.",
  "Teams 2v2: teammates share a score and a private chat channel.",
];

let els = null;
function ensure() {
  if (els) return els;
  root().innerHTML = `
    <style>
      #ui * { box-sizing: border-box; }
      #ui::before { content:""; position:absolute; inset:0; pointer-events:none; background: radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 55%, rgba(4,25,40,.28) 100%); }
      #ui .px { font-family: "Press Start 2P", monospace; }
      .hud-panel { background:#0f3446; color:#fff; border:3px solid #f1d48e; box-shadow: 0 4px 0 #6d4320, inset 0 0 0 2px #1a4a5f; }
      .hud-top { position:absolute; top:12px; left:12px; right:12px; display:flex; justify-content:flex-start; gap:8px; align-items:flex-start; pointer-events:none; }
      .hud-pill { font-family:"Press Start 2P", monospace; font-size:14px; padding:11px 14px 9px; display:flex; align-items:center; gap:8px; }
      .coin { display:inline-block; width:12px; height:12px; background:#ffd23f; box-shadow: inset -3px -3px 0 #d99a1a, 0 0 0 2px #7a4a10; }
      .hud-hp { width:120px; height:14px; overflow:hidden; padding:0; align-self:center; display:none; }
      .hud-hp > i { display:block; height:100%; width:100%; background:#62d26f; transition:width .25s, background .25s; box-shadow: inset 0 -4px 0 rgba(0,0,0,.25); }
      .hud-hurt { position:absolute; inset:0; pointer-events:none; opacity:0; background: radial-gradient(ellipse at center, rgba(255,60,40,0) 45%, rgba(255,60,40,.55) 100%); transition:opacity .5s; }
      .hud-hurt.on { opacity:1; transition:opacity .05s; }
      .hud-banner { position:absolute; left:50%; top:38%; transform:translate(-50%,-50%); display:none; text-align:center; font-family:"Press Start 2P", monospace; font-size:18px; line-height:1.8; color:#ffd23f; text-shadow: 3px 3px 0 #b53d1a, 6px 6px 0 rgba(6,42,58,.8); white-space:pre-line; padding:14px 22px; }
      .hud-fuse { width:220px; height:18px; overflow:hidden; display:none; padding:0; }
      .hud-fuse > i { display:block; height:100%; width:100%; background:#5df26a; transition:background .2s; box-shadow: inset 0 -5px 0 rgba(0,0,0,.25); }
      .hud-hint.with-bar { bottom:112px; }
      .hud-hint { display:none; position:absolute; left:50%; bottom:18px; transform:translateX(-50%); max-width:92vw; text-align:center; font-weight:700; font-size:13px; padding:9px 14px; }
      .hud-phase { position:absolute; right:12px; top:14px; font-family:"Press Start 2P", monospace; font-size:12px; color:#fff; text-shadow:2px 2px 0 rgba(0,0,0,.4); display:none; padding:11px 14px 9px; align-items:center; gap:10px; }
      .hud-phase b { font-size:18px; color:#ffd23f; }
      .hud-board { position:absolute; left:12px; bottom:18px; display:flex; flex-direction:column; gap:5px; }
      .hud-board div { display:flex; align-items:center; gap:8px; padding:7px 10px; font-family:"Press Start 2P", monospace; font-size:9px; min-width:170px; }
      .hud-board div.me { border-color:#ffd23f; }
      .hud-board div.team { color:#fff; text-shadow:1px 1px 0 rgba(0,0,0,.5); margin-top:3px; }
      .hud-board div.team span { color:#fff; }
      .hud-board i.sq { width:10px; height:10px; flex:none; box-shadow: inset -2px -2px 0 rgba(0,0,0,.35), 0 0 0 2px #062a3a; }
      .hud-board span { margin-left:auto; display:flex; align-items:center; gap:5px; color:#ffd23f; }
      .hud-board span .coin { width:9px; height:9px; }
      .hud-board span .flags { color:#fff; margin-right:6px; font-weight:normal; }
      .hud-board small.dead { color:#ff6b3d; font-size:7px; margin-left:4px; }
      .hud-label { position:absolute; transform:translate(-50%,-100%); color:#fff; font-family:"Press Start 2P", monospace; font-size:9px; padding:6px 9px 5px; border:2px solid rgba(6,42,58,.9); box-shadow: 0 3px 0 rgba(6,42,58,.9); text-shadow:1px 1px 0 rgba(0,0,0,.5); white-space:nowrap; }
      .hud-label.mine { outline:2px solid #ffd23f; }
      .hud-build { position:absolute; left:50%; bottom:18px; transform:translateX(-50%); display:none; gap:6px; padding:8px; align-items:stretch; }
      .hud-build button { font-family:"Press Start 2P", monospace; font-size:8px; color:#fff; background:#082130; border:2px solid #1a4a5f; padding:6px 6px 5px; min-width:62px; display:flex; flex-direction:column; align-items:center; gap:5px; cursor:pointer; box-shadow: 0 3px 0 #041520; }
      .hud-build button:active { transform:translateY(2px); box-shadow:none; }
      .hud-build button.on { border-color:#ffd23f; background:#0f3446; }
      .hud-build button i { width:22px; height:22px; box-shadow: inset -4px -4px 0 rgba(0,0,0,.35), 0 0 0 2px #062a3a; }
      .hud-build button.tool i { background:#1fb6dc; }
      .hud-build button.tool.remove i { background:#ff4b3e; }
      .hud-bombs { position:absolute; left:50%; bottom:18px; transform:translateX(-50%); display:none; gap:6px; padding:8px; align-items:stretch; pointer-events:auto; }
      .hud-bombs button { font-family:"Press Start 2P", monospace; font-size:8px; color:#fff; background:#082130; border:2px solid #1a4a5f; padding:6px 6px 5px; min-width:64px; display:flex; flex-direction:column; align-items:center; gap:5px; cursor:pointer; box-shadow: 0 3px 0 #041520; position:relative; }
      .hud-bombs button:active { transform:translateY(2px); box-shadow:none; }
      .hud-bombs button.on { border-color:#ffd23f; background:#0f3446; }
      .hud-bombs button.empty { opacity:.4; cursor:default; }
      .hud-bombs button i.ball { width:18px; height:18px; border-radius:50%; box-shadow: inset -4px -4px 0 rgba(0,0,0,.35), 0 0 0 2px #062a3a; }
      .hud-bombs button b { position:absolute; right:-6px; top:-8px; background:#ffd23f; color:#3a1a10; font-size:8px; padding:3px 4px 2px; border:2px solid #3a1a10; }
      .hud-bombs button small { font-size:6px; color:#a9d6e6; }
      @media (pointer: coarse) { .hud-bombs button small { display:none; } }
      .hud-build .budget { font-family:"Press Start 2P", monospace; font-size:9px; color:#ffd23f; display:flex; align-items:center; padding:0 10px; }
      /* one gear button opens the settings panel (view, sound, zoom): the play screen stays clear of controls */
      .hud-gear { position:absolute; right:12px; top:66px; width:38px; height:36px; padding:0; font-size:18px; line-height:1; cursor:pointer; pointer-events:auto; color:#fff; }
      .hud-gear.on { border-color:#ffd23f; }
      .hud-settings { position:absolute; right:12px; top:110px; display:none; flex-direction:column; gap:8px; padding:10px; pointer-events:auto; font-family:"Press Start 2P", monospace; font-size:8px; color:#a9d6e6; min-width:190px; }
      .hud-settings.open { display:flex; }
      .hud-settings .row { display:flex; align-items:center; gap:6px; }
      .hud-settings .row > span { width:52px; letter-spacing:1px; }
      .hud-settings button { font-family:"Press Start 2P", monospace; font-size:8px; color:#fff; background:#082130; border:2px solid #1a4a5f; padding:7px 8px 6px; min-width:38px; cursor:pointer; pointer-events:auto; box-shadow: 0 3px 0 #041520; }
      .hud-settings button:active { transform:translateY(2px); box-shadow:none; }
      .hud-settings button.on { border-color:#ffd23f; background:#0f3446; color:#ffd23f; }
      .hud-settings button[disabled] { opacity:.35; cursor:default; }
      .hud-settings button.danger { background:#b53d1a; border-color:#3a1a10; box-shadow:0 3px 0 #6a2210; flex:1; }
      /* confirmation modal (leave match, host left): dimmed backdrop, pixel card, two chunky buttons */
      .hud-modal { position:absolute; inset:0; display:grid; place-items:center; background:rgba(3,20,32,.62); pointer-events:auto; z-index:6; }
      .hud-modal[hidden] { display:none; }
      .hud-modal-card { width:min(420px, 86vw); padding:18px 18px 16px; text-align:center; font-family:"Press Start 2P", monospace; }
      .hud-modal-card h2 { margin:0 0 10px; font-size:14px; color:#ffd23f; text-shadow:2px 2px 0 #b53d1a; line-height:1.4; }
      .hud-modal-card p { margin:0 0 16px; font-size:8px; line-height:1.9; color:#a9d6e6; }
      .hud-modal-card .btns { display:flex; gap:10px; justify-content:center; }
      .hud-modal-card button { font:9px/1 "Press Start 2P", monospace; letter-spacing:1px; text-transform:uppercase; padding:12px 16px 10px; cursor:pointer; border:3px solid #062a3a; color:#062a3a; background:#1fb6dc; box-shadow:0 5px 0 #0e7fa3, 0 5px 0 3px #062a3a; }
      .hud-modal-card button.ok { background:#ff6b3d; color:#fff; border-color:#3a1a10; box-shadow:0 5px 0 #b53d1a, 0 5px 0 3px #3a1a10; }
      .hud-modal-card button:active { transform:translateY(4px); box-shadow:0 1px 0 #0e7fa3, 0 1px 0 3px #062a3a; }
      .hud-modal-card button.ok:active { box-shadow:0 1px 0 #b53d1a, 0 1px 0 3px #3a1a10; }
      .hud-modal-card button[hidden] { display:none; }
      @media (max-height: 500px) { .hud-modal-card { padding:12px; } .hud-modal-card h2 { font-size:11px; } .hud-modal-card p { font-size:7px; margin-bottom:10px; } .hud-modal-card button { font-size:8px; padding:9px 12px 8px; } }
      .hud-cross { position:absolute; left:50%; top:50%; width:18px; height:18px; transform:translate(-50%,-50%); display:none; pointer-events:none; }
      .hud-cross::before, .hud-cross::after { content:""; position:absolute; background:#fff; box-shadow:0 0 0 1px rgba(0,0,0,.5); }
      .hud-cross::before { left:7px; top:0; width:4px; height:18px; } .hud-cross::after { top:7px; left:0; width:18px; height:4px; }
      .hud-charge { position:absolute; left:50%; top:calc(50% + 22px); transform:translateX(-50%); width:120px; height:10px; display:none; padding:0; overflow:hidden; }
      .hud-charge > i { display:block; height:100%; width:0; background:#ff6b3d; }
      /* compact layout: narrow screens, and every touch device (the bottom of the screen belongs to the joystick / action buttons; the gear lives in the touch controls' top row) */
      @media (max-width: 900px), (pointer: coarse) {
        .hud-pill { font-size:10px; padding:8px 10px 6px; }
        .hud-phase { font-size:9px; padding:8px 10px 6px; } .hud-phase b { font-size:13px; }
        .hud-gear { display:none; }
        /* touch: the panel opens beside the CHAT / gear row (top:110px), left of it, so it never covers the build / throw buttons in the corner */
        .hud-settings { top:110px; right:calc(150px + env(safe-area-inset-right)); min-width:0; padding:6px; gap:4px; font-size:7px; }
        .hud-settings .row > span { width:44px; }
        .hud-settings button { font-size:7px; padding:6px 6px 5px; min-width:34px; }
        .hud-board { bottom:auto; top:52px; gap:3px; } .hud-board div { font-size:7px; min-width:120px; padding:5px 7px; }
        .hud-hint, .hud-hint.with-bar { font-size:10px; padding:5px 8px; max-width:52vw; bottom:auto; top:10px; left:50%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .hud-label { font-size:7px; padding:4px 6px 3px; }
        .hud-build { left:50%; bottom:auto; top:44px; transform:translateX(-50%); max-width:56vw; overflow-x:auto; gap:4px; padding:5px; }
        .hud-build button { min-width:46px; font-size:6px; padding:4px 4px 3px; } .hud-build button i { width:16px; height:16px; }
        .hud-bombs { left:50%; bottom:auto; top:44px; transform:translateX(-50%); gap:4px; padding:5px; }
        .hud-bombs button { min-width:48px; font-size:6px; padding:4px 4px 3px; } .hud-bombs button i.ball { width:14px; height:14px; }
        .hud-fuse { width:120px; height:12px; }
      }
      @media (max-width: 640px) { .hud-hint, .hud-hint.with-bar, .hud-build, .hud-bombs { max-width:44vw; } } /* 568px-wide phones: keep the centred bars clear of the phase timer and the scoreboard */
      /* touch devices: everything HUD shrinks into the top corners so the islands stay visible on a 320-420px tall phone */
      @media (pointer: coarse) {
        .hud-top { top:6px; left:6px; right:6px; gap:4px; }
        .hud-pill { font-size:7px; padding:5px 7px 4px; gap:5px; } .hud-pill .coin { width:8px; height:8px; }
        .hud-fuse { width:90px; height:10px; }
        .hud-hp { width:64px; height:9px; }
        .hud-banner { font-size:11px; padding:8px 12px; }
        .hud-phase { top:6px; right:6px; font-size:7px; padding:5px 7px 4px; gap:6px; } .hud-phase b { font-size:10px; }
        .hud-board { top:32px; left:6px; gap:2px; } .hud-board div { font-size:6px; min-width:96px; padding:3px 5px 2px; gap:5px; border-width:2px; box-shadow:0 2px 0 #6d4320; } .hud-board i.sq { width:7px; height:7px; } .hud-board span .coin { width:7px; height:7px; }
        .hud-hint, .hud-hint.with-bar { font-size:8px; padding:4px 8px; max-width:42vw; top:6px; border-width:2px; box-shadow:0 2px 0 #6d4320; transition:opacity .8s; }
        .hud-hint.fade { opacity:0; }
        .hud-build, .hud-bombs { top:30px; gap:3px; padding:3px; max-width:min(50vw, 100vw - 400px); border-width:2px; box-shadow:0 2px 0 #6d4320; } /* leaves room for the open settings panel on 568px phones */
        .hud-build button, .hud-bombs button { min-width:36px; font-size:5px; padding:3px 3px 2px; gap:3px; } .hud-build button i { width:12px; height:12px; } .hud-bombs button i.ball { width:11px; height:11px; }
        .hud-build .budget { font-size:6px; padding:0 5px; }
        .hud-label { font-size:6px; padding:3px 5px 2px; }
        .hud-settings { top:66px; right:calc(6px + env(safe-area-inset-right)); }
        .hud-charge { width:90px; height:8px; }
      }
      .hud-pop { position:absolute; font-family:"Press Start 2P", monospace; font-size:18px; text-shadow:2px 2px 0 rgba(0,0,0,.5); animation: pop 1s ease-out forwards; pointer-events:none; transform:translate(-50%,-50%); }
      @keyframes pop { from { opacity:1; margin-top:0 } to { opacity:0; margin-top:-70px } }
    </style>
    <div class="hud-top">
      <div class="hud-pill hud-panel" data-coins><i class="coin"></i><span>0</span></div>
      <div class="hud-hp hud-panel" data-hp title="Health"><i></i></div>
      <div class="hud-fuse hud-panel" data-fuse><i></i></div>
    </div>
    <div class="hud-phase hud-panel" data-phase></div>
    <div class="hud-board" data-board></div>
    <div data-labels></div>
    <div class="hud-hint hud-panel" data-hint></div>
    <div class="hud-build hud-panel" data-build></div>
    <div class="hud-bombs hud-panel" data-bombs></div>
    <button class="hud-gear hud-panel" data-gear title="Settings" aria-label="Settings">&#9881;</button>
    <div class="hud-settings hud-panel" data-settings>
      <div class="row"><span>SOUND</span><button data-sound>ON</button></div>
      <div class="row"><span>ZOOM</span><button data-zoom-in title="Zoom in (+)">+</button><button data-zoom-out title="Zoom out (-)">-</button></div>
      <div class="row"><span></span><button class="danger" data-leave>LEAVE MATCH</button></div>
    </div>
    <div class="hud-modal" data-modal hidden>
      <div class="hud-modal-card hud-panel"><h2 data-modal-title></h2><p data-modal-text></p><div class="btns"><button class="ok" data-modal-ok>OK</button><button class="cancel" data-modal-cancel>CANCEL</button></div></div>
    </div>
    <div class="hud-cross" data-cross></div>
    <div class="hud-hurt" data-hurt></div>
    <div class="hud-banner hud-panel" data-banner></div>
    <div class="hud-charge hud-panel" data-charge><i></i></div>`;
  els = {
    coins: root().querySelector("[data-coins] > span"),
    fuse: root().querySelector("[data-fuse]"),
    fuseBar: root().querySelector("[data-fuse] > i"),
    hint: root().querySelector("[data-hint]"),
    phase: root().querySelector("[data-phase]"),
    board: root().querySelector("[data-board]"),
    labels: root().querySelector("[data-labels]"),
    build: root().querySelector("[data-build]"),
    bombs: root().querySelector("[data-bombs]"),
    sound: root().querySelector("[data-sound]"),
    gear: root().querySelector("[data-gear]"),
    settings: root().querySelector("[data-settings]"),
    leave: root().querySelector("[data-leave]"),
    modal: root().querySelector("[data-modal]"),
    hp: root().querySelector("[data-hp]"),
    hpBar: root().querySelector("[data-hp] > i"),
    hurt: root().querySelector("[data-hurt]"),
    banner: root().querySelector("[data-banner]"),
    views: [...root().querySelectorAll("[data-view]")],
    zoomIn: root().querySelector("[data-zoom-in]"),
    zoomOut: root().querySelector("[data-zoom-out]"),
    cross: root().querySelector("[data-cross]"),
    charge: root().querySelector("[data-charge]"),
    chargeBar: root().querySelector("[data-charge] > i"),
  };
  els.gear.addEventListener("click", () => hud.toggleSettings());
  return els;
}

export const hud = {
  setCoins(n) {
    ensure().coins.textContent = String(n);
  },
  /** Health bar next to the coins: fraction 0..1, or null to hide (lobby / results). */
  setHp(fraction) {
    const { hp, hpBar } = ensure();
    hp.style.display = fraction === null ? "none" : "block";
    if (fraction === null) return;
    hpBar.style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
    hpBar.style.background = fraction > 0.5 ? "#62d26f" : fraction > 0.25 ? "#ffd23f" : "#ff4b3e";
  },
  /** Red vignette flash when we take blast damage. */
  hurt() {
    const { hurt } = ensure();
    hurt.classList.add("on");
    clearTimeout(hurt._t);
    hurt._t = setTimeout(() => hurt.classList.remove("on"), 120);
  },
  /** Big centred text (respawn countdown); null hides it. */
  setBanner(text) {
    const { banner } = ensure();
    banner.style.display = text ? "block" : "none";
    banner.textContent = text ?? "";
  },
  /** fraction 0..1 of fuse remaining on the bomb in hand, or null to hide. */
  setFuse(fraction) {
    const { fuse, fuseBar } = ensure();
    if (fraction === null) {
      if (fuse.style.display !== "none") fuse.style.display = "none";
      return;
    }
    if (fuse.style.display !== "block") fuse.style.display = "block";
    fuseBar.style.width = `${Math.max(0, fraction) * 100}%`;
    fuseBar.style.background = fraction > 0.5 ? "#5df26a" : fraction > 0.25 ? "#ffd23f" : "#ff4b3e";
  },
  /** Hint bar. On touch devices it fades out after a few seconds so the play screen stays clear; a new hint brings it back. */
  setHint(text) {
    const { hint } = ensure();
    hint.textContent = text ?? "";
    hint.style.display = text ? "block" : "none";
    hint.classList.remove("fade");
    clearTimeout(hint._fadeTimer);
    if (text && matchMedia("(pointer: coarse)").matches) hint._fadeTimer = setTimeout(() => hint.classList.add("fade"), 5000);
  },
  popText({ x, y }, text, color = "#fff") {
    const el = document.createElement("div");
    el.className = "hud-pop";
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.color = color;
    el.textContent = text;
    root().appendChild(el);
    setTimeout(() => el.remove(), 1000);
  },
  /** Phase name + mm:ss countdown. Hidden in the lobby. Called every frame, so it only writes when the second changes. */
  /**
   * Top-right pill. Classic: phase and time left. Capture the flag (`hold` given): the leader's hold time out
   * of the time needed to win, e.g. "FLAG 0:12 / 1:00".
   */
  setPhase(phase, msRemaining, hold = null) {
    const { phase: el } = ensure();
    if (!phase || phase === "lobby") {
      if (el._key !== "hidden") { el._key = "hidden"; el.style.display = "none"; }
      return;
    }
    const mmss = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
    if (hold && phase === "combat") {
      const key = `hold:${Math.floor(hold.ms / 1000)}:${hold.mine ? 1 : 0}`;
      if (el._key === key) return;
      el._key = key;
      el.style.display = "flex";
      el.innerHTML = `${hold.mine ? "YOU HOLD" : "FLAG"}<b>${mmss(hold.ms)} / ${mmss(hold.toWin)}</b>`;
      return;
    }
    const s = Math.max(0, Math.ceil(msRemaining / 1000));
    const key = `${phase}:${s}`;
    if (el._key === key) return;
    el._key = key;
    const label = { build: "BUILD", combat: "COMBAT", results: "RESULTS" }[phase] ?? phase.toUpperCase();
    el.style.display = "flex";
    el.innerHTML = `${label}<b>${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}</b>`;
  },
  /** Bottom-left standings. Free-for-all: one row per player. Teams: a team total row, then its members. */
  /** `hold: true` (capture the flag) shows each player's flag hold time and ranks by it instead of coins. */
  setScoreboard(players, myKey, mode = GameMode.FFA, { hold = false } = {}) {
    const { board } = ensure();
    // chat panel sits just above the board: publish its height (rows incl. team headers)
    const rows = mode === GameMode.TEAMS ? players.length + 2 : players.length;
    root().style.setProperty("--board-h", `${rows * 34}px`);
    const hex = (c) => `#${c.toString(16).padStart(6, "0")}`;
    const mmss = (ms) => { const s = Math.max(0, Math.floor((ms ?? 0) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
    const score = (p) => (hold ? `<b class="flags" title="Flag hold time">&#9873;${mmss(p.holdMs)}</b>` : `<i class="coin"></i>${p.coins}`);
    const row = (p, color) => `<div class="hud-panel ${p.key === myKey ? "me" : ""}"><i class="sq" style="background:${color}"></i>${esc(p.name)}${p.isBot ? " [bot]" : ""}${p.dead ? ' <small class="dead">KO</small>' : ""}<span>${score(p)}</span></div>`;
    const key = hold ? "holdMs" : "coins";
    if (mode === GameMode.TEAMS) {
      board.innerHTML = rankTeams(players, mode, key)
        .map((t) => `<div class="hud-panel team" style="background:${hex(TEAM_COLORS[t.team % TEAM_COLORS.length])}">${esc(TEAM_NAMES[t.team] ?? `Team ${t.team + 1}`)}<span>${hold ? `<b class="flags">&#9873;${mmss(t.holdMs)}</b>` : `<i class="coin"></i>${t.coins}`}</span></div>` +
          t.members.map((p) => row(p, hex(TEAM_COLORS[t.team % TEAM_COLORS.length]))).join(""))
        .join("");
      return;
    }
    board.innerHTML = players
      .slice()
      .sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0) || b.coins - a.coins || a.islandIndex - b.islandIndex)
      .map((p) => row(p, hex(PLAYER_COLORS[p.islandIndex % PLAYER_COLORS.length])))
      .join("");
  },
  /** Floating name tags over islands. items: { x, y, text, color, mine } in screen px. */
  setLabels(items) {
    const { labels } = ensure();
    while (labels.children.length < items.length) labels.appendChild(Object.assign(document.createElement("div"), { className: "hud-label" }));
    [...labels.children].forEach((el, i) => {
      const it = items[i];
      if (!it) { el.style.display = "none"; return; }
      el.style.display = "block";
      el.style.left = `${it.x}px`;
      el.style.top = `${it.y}px`;
      el.style.background = it.color;
      el.className = `hud-label${it.mine ? " mine" : ""}`;
      el.textContent = it.text;
    });
  },
  /** Build bar: piece buttons, rotate, remove mode, budget. Buttons are pointer-enabled. */
  showBuildBar({ pieces, onSelect, onRotate, onRemoveMode }) {
    const { build } = ensure();
    build.style.display = "flex";
    build.style.pointerEvents = "auto";
    build.innerHTML =
      pieces.map((p, i) => `<button data-type="${p.type}" title="${i + 1}"><i style="background:${p.color}"></i>${p.name}</button>`).join("") +
      `<button class="tool" data-rotate><i></i>Rotate</button><button class="tool remove" data-remove><i></i>Remove</button><span class="budget" data-budget></span>`;
    build.querySelectorAll("[data-type]").forEach((b) => b.addEventListener("click", () => onSelect(Number(b.dataset.type))));
    build.querySelector("[data-rotate]").addEventListener("click", onRotate);
    build.querySelector("[data-remove]").addEventListener("click", onRemoveMode);
    ensure().hint.classList.add("with-bar");
  },
  setBuildState({ type, mode, count, max }) {
    const { build } = ensure();
    build.querySelectorAll("[data-type]").forEach((b) => b.classList.toggle("on", mode === "place" && Number(b.dataset.type) === type));
    build.querySelector("[data-remove]")?.classList.toggle("on", mode === "remove");
    const budget = build.querySelector("[data-budget]");
    if (budget) budget.textContent = `${count}/${max}`;
  },
  /**
   * Combat bomb selector: one button per bomb type. types: [{ type, name, color, key }], onSelect(type).
   * Counts come from setBombState(); the standard bomb is unlimited.
   */
  showBombBar({ types, onSelect }) {
    const { bombs } = ensure();
    bombs.dataset.active = "1";
    bombs.style.display = "none"; // appears through setBombState() once a special bomb is held: nothing to pick from before that
    bombs.innerHTML = types.map((t) => `<button data-bomb="${t.type}" title="${t.key}"><i class="ball" style="background:${t.color}"></i>${esc(t.name)}<small>${t.key ? `KEY ${t.key}` : ""}</small><b hidden></b></button>`).join("");
    bombs.querySelectorAll("[data-bomb]").forEach((b) => b.addEventListener("click", () => onSelect(b.dataset.bomb)));
  },
  /** counts: { [type]: n } for special bombs; selected: current BombType. The bar only shows while a special bomb is held. */
  setBombState({ counts, selected }) {
    const { bombs, hint } = ensure();
    const special = Object.values(counts ?? {}).some((n) => n > 0);
    const show = bombs.dataset.active === "1" && (special || (selected && selected !== "standard"));
    bombs.style.display = show ? "flex" : "none";
    hint.classList.toggle("with-bar", show);
    bombs.querySelectorAll("[data-bomb]").forEach((b) => {
      const type = b.dataset.bomb, n = type === "standard" ? Infinity : counts[type] ?? 0;
      b.classList.toggle("on", type === selected);
      b.classList.toggle("empty", n === 0);
      const badge = b.querySelector("b");
      badge.hidden = !(n > 0 && n !== Infinity);
      badge.textContent = n === Infinity ? "" : `x${n}`;
    });
  },
  hideBombBar() {
    const { bombs, hint } = ensure();
    bombs.dataset.active = "";
    bombs.style.display = "none";
    hint.classList.remove("with-bar");
  },
  hideBuildBar() {
    const { build, hint } = ensure();
    build.style.display = "none";
    hint.classList.remove("with-bar");
  },
  setSound(on, onToggle) {
    const { sound } = ensure();
    sound.textContent = on ? "ON" : "OFF";
    sound.classList.toggle("on", on);
    if (onToggle) sound.onclick = onToggle;
  },
  /** Highlights `mode` in the settings panel; onSelect(mode) is wired to the three view buttons when given. */
  setView(mode, onSelect) {
    const { views, cross, zoomIn, zoomOut } = ensure();
    views.forEach((b) => { b.classList.toggle("on", b.dataset.view === mode); if (onSelect) b.onclick = () => { onSelect(b.dataset.view); hud.toggleSettings(false); }; });
    cross.style.display = mode === "first" ? "block" : "none";
    zoomIn.disabled = zoomOut.disabled = mode === "first";
  },
  setZoom(onIn, onOut) {
    const { zoomIn, zoomOut } = ensure();
    zoomIn.onclick = onIn;
    zoomOut.onclick = onOut;
  },
  /** LEAVE MATCH in the settings panel. onLeave() is expected to confirm first (see confirm()). */
  setLeave(onLeave) {
    const { leave } = ensure();
    leave.onclick = onLeave;
    leave.parentElement.style.display = onLeave ? "" : "none";
  },
  /**
   * In-game confirmation dialog (never window.alert / confirm). Resolves true for OK, false for cancel or
   * Escape. `cancel: null` shows a single button (an acknowledgement).
   */
  confirm({ title, text = "", ok = "OK", cancel = "CANCEL" }) {
    const { modal } = ensure();
    return new Promise((resolve) => {
      modal.querySelector("[data-modal-title]").textContent = title;
      modal.querySelector("[data-modal-text]").textContent = text;
      const okBtn = modal.querySelector("[data-modal-ok]"), cancelBtn = modal.querySelector("[data-modal-cancel]");
      okBtn.textContent = ok;
      cancelBtn.textContent = cancel ?? "";
      cancelBtn.hidden = cancel === null;
      const done = (v) => { modal.hidden = true; window.removeEventListener("keydown", onKey, true); resolve(v); };
      const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); done(false); } };
      okBtn.onclick = () => done(true);
      cancelBtn.onclick = () => done(false);
      window.addEventListener("keydown", onKey, true);
      modal.hidden = false;
      okBtn.focus?.();
    });
  },
  /** Opens / closes the settings panel (gear). Pass a boolean to force a state. */
  toggleSettings(open) {
    const { settings, gear } = ensure();
    const on = typeof open === "boolean" ? open : !settings.classList.contains("open");
    settings.classList.toggle("open", on);
    gear.classList.toggle("on", on);
  },
  setCharge(fraction) {
    const { charge, chargeBar } = ensure();
    charge.style.display = fraction === null ? "none" : "block";
    if (fraction !== null) chargeBar.style.width = `${Math.round(fraction * 100)}%`;
  },
  /**
   * The page's loading screen (index.html #loading: bouncing bomb, striped bar, rotating tips). `text` is the
   * status line; null fades it out. Used at boot, while finding a bay and while the match scene is built.
   */
  showLoading(text) {
    const el = document.getElementById("loading");
    if (!el) return;
    if (!text) {
      el.classList.add("hide");
      clearInterval(el._tips); el._tips = null;
      clearTimeout(el._hideTimer);
      el._hideTimer = setTimeout(() => { if (el.classList.contains("hide")) el.hidden = true; }, 400);
      return;
    }
    clearTimeout(el._hideTimer);
    el.hidden = false;
    el.classList.remove("hide");
    el.querySelector("[data-status]").textContent = text.toUpperCase();
    if (!el._tips) {
      const tip = el.querySelector("[data-tip]");
      let i = Math.floor(Math.random() * LOADING_TIPS.length);
      const next = () => { tip.textContent = LOADING_TIPS[i++ % LOADING_TIPS.length]; };
      next();
      el._tips = setInterval(next, 2800);
    }
  },
};

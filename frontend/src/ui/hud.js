import { GameMode, PLAYER_COLORS, TEAM_COLORS, TEAM_NAMES, rankTeams } from "@kaboom-bay/shared";

/** Minimal DOM HUD shared by the sandbox and the online match. Works on touch. */
const root = () => document.getElementById("ui");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

let els = null;
function ensure() {
  if (els) return els;
  root().innerHTML = `
    <style>
      #ui * { box-sizing: border-box; }
      #ui::before { content:""; position:absolute; inset:0; pointer-events:none; background: radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 55%, rgba(4,25,40,.28) 100%); }
      #ui .px { font-family: "Press Start 2P", monospace; }
      .hud-panel { background:#0f3446; color:#fff; border:3px solid #f1d48e; box-shadow: 0 4px 0 #6d4320, inset 0 0 0 2px #1a4a5f; }
      .hud-top { position:absolute; top:12px; left:12px; right:12px; display:flex; justify-content:space-between; align-items:flex-start; }
      .hud-pill { font-family:"Press Start 2P", monospace; font-size:14px; padding:11px 14px 9px; display:flex; align-items:center; gap:8px; }
      .coin { display:inline-block; width:12px; height:12px; background:#ffd23f; box-shadow: inset -3px -3px 0 #d99a1a, 0 0 0 2px #7a4a10; }
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
      .hud-sound { position:absolute; right:12px; top:66px; font-family:"Press Start 2P", monospace; font-size:9px; padding:8px 10px 7px; cursor:pointer; pointer-events:auto; color:#fff; }
      .hud-cross { position:absolute; left:50%; top:50%; width:18px; height:18px; transform:translate(-50%,-50%); display:none; pointer-events:none; }
      .hud-cross::before, .hud-cross::after { content:""; position:absolute; background:#fff; box-shadow:0 0 0 1px rgba(0,0,0,.5); }
      .hud-cross::before { left:7px; top:0; width:4px; height:18px; } .hud-cross::after { top:7px; left:0; width:18px; height:4px; }
      .hud-charge { position:absolute; left:50%; top:calc(50% + 22px); transform:translateX(-50%); width:120px; height:10px; display:none; padding:0; overflow:hidden; }
      .hud-charge > i { display:block; height:100%; width:0; background:#ff6b3d; }
      .hud-zoom { position:absolute; right:12px; top:154px; display:flex; gap:6px; }
      .hud-zoom button { font-family:"Press Start 2P", monospace; font-size:12px; width:36px; height:34px; padding:0; cursor:pointer; pointer-events:auto; color:#fff; }
      .hud-view { position:absolute; right:12px; top:110px; font-family:"Press Start 2P", monospace; font-size:9px; padding:8px 10px 7px; cursor:pointer; pointer-events:auto; color:#fff; }
      @media (max-width: 900px) {
        .hud-pill { font-size:10px; padding:8px 10px 6px; }
        .hud-phase { font-size:9px; padding:8px 10px 6px; } .hud-phase b { font-size:13px; }
        .hud-sound, .hud-view, .hud-zoom { display:none; }
        .hud-board { bottom:auto; top:52px; gap:3px; } .hud-board div { font-size:7px; min-width:120px; padding:5px 7px; }
        .hud-hint, .hud-hint.with-bar { font-size:10px; padding:5px 8px; max-width:52vw; bottom:auto; top:10px; left:50%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .hud-label { font-size:7px; padding:4px 6px 3px; }
        .hud-build { left:50%; bottom:auto; top:44px; transform:translateX(-50%); max-width:56vw; overflow-x:auto; gap:4px; padding:5px; }
        .hud-build button { min-width:46px; font-size:6px; padding:4px 4px 3px; } .hud-build button i { width:16px; height:16px; }
        .hud-bombs { left:50%; bottom:auto; top:44px; transform:translateX(-50%); gap:4px; padding:5px; }
        .hud-bombs button { min-width:48px; font-size:6px; padding:4px 4px 3px; } .hud-bombs button i.ball { width:14px; height:14px; }
        .hud-fuse { width:120px; height:12px; }
      }
      .hud-pop { position:absolute; font-family:"Press Start 2P", monospace; font-size:18px; text-shadow:2px 2px 0 rgba(0,0,0,.5); animation: pop 1s ease-out forwards; pointer-events:none; transform:translate(-50%,-50%); }
      @keyframes pop { from { opacity:1; margin-top:0 } to { opacity:0; margin-top:-70px } }
    </style>
    <div class="hud-top">
      <div class="hud-pill hud-panel" data-coins><i class="coin"></i><span>0</span></div>
      <div class="hud-fuse hud-panel" data-fuse><i></i></div>
    </div>
    <div class="hud-phase hud-panel" data-phase></div>
    <div class="hud-board" data-board></div>
    <div data-labels></div>
    <div class="hud-hint hud-panel" data-hint></div>
    <div class="hud-build hud-panel" data-build></div>
    <div class="hud-bombs hud-panel" data-bombs></div>
    <button class="hud-sound hud-panel" data-sound>SND ON</button>
    <button class="hud-view hud-panel" data-view>VIEW: 3RD</button>
    <div class="hud-zoom"><button class="hud-panel" data-zoom-in title="Zoom in (+)">+</button><button class="hud-panel" data-zoom-out title="Zoom out (-)">-</button></div>
    <div class="hud-cross" data-cross></div>
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
    view: root().querySelector("[data-view]"),
    zoomIn: root().querySelector("[data-zoom-in]"),
    zoomOut: root().querySelector("[data-zoom-out]"),
    cross: root().querySelector("[data-cross]"),
    charge: root().querySelector("[data-charge]"),
    chargeBar: root().querySelector("[data-charge] > i"),
  };
  return els;
}

export const hud = {
  setCoins(n) {
    ensure().coins.textContent = String(n);
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
  setHint(text) {
    const { hint } = ensure();
    hint.textContent = text ?? "";
    hint.style.display = text ? "block" : "none";
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
  setPhase(phase, msRemaining) {
    const { phase: el } = ensure();
    if (!phase || phase === "lobby") {
      if (el._key !== "hidden") { el._key = "hidden"; el.style.display = "none"; }
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
  setScoreboard(players, myKey, mode = GameMode.FFA) {
    const { board } = ensure();
    // chat panel sits just above the board: publish its height (rows incl. team headers)
    const rows = mode === GameMode.TEAMS ? players.length + 2 : players.length;
    root().style.setProperty("--board-h", `${rows * 34}px`);
    const hex = (c) => `#${c.toString(16).padStart(6, "0")}`;
    const row = (p, color) => `<div class="hud-panel ${p.key === myKey ? "me" : ""}"><i class="sq" style="background:${color}"></i>${esc(p.name)}${p.isBot ? " [bot]" : ""}<span><i class="coin"></i>${p.coins}</span></div>`;
    if (mode === GameMode.TEAMS) {
      board.innerHTML = rankTeams(players, mode)
        .map((t) => `<div class="hud-panel team" style="background:${hex(TEAM_COLORS[t.team % TEAM_COLORS.length])}">${esc(TEAM_NAMES[t.team] ?? `Team ${t.team + 1}`)}<span><i class="coin"></i>${t.coins}</span></div>` +
          t.members.map((p) => row(p, hex(TEAM_COLORS[t.team % TEAM_COLORS.length]))).join(""))
        .join("");
      return;
    }
    board.innerHTML = players
      .slice()
      .sort((a, b) => b.coins - a.coins || a.islandIndex - b.islandIndex)
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
    bombs.style.display = "flex";
    bombs.innerHTML = types.map((t) => `<button data-bomb="${t.type}" title="${t.key}"><i class="ball" style="background:${t.color}"></i>${esc(t.name)}<small>${t.key ? `KEY ${t.key}` : ""}</small><b hidden></b></button>`).join("");
    bombs.querySelectorAll("[data-bomb]").forEach((b) => b.addEventListener("click", () => onSelect(b.dataset.bomb)));
    ensure().hint.classList.add("with-bar");
  },
  /** counts: { [type]: n } for special bombs; selected: current BombType. */
  setBombState({ counts, selected }) {
    const { bombs } = ensure();
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
    sound.textContent = on ? "SND ON" : "SND OFF";
    sound.style.opacity = on ? "1" : "0.7";
    if (onToggle) sound.onclick = onToggle;
  },
  setView(mode, onToggle) {
    const { view, cross, zoomIn, zoomOut } = ensure();
    view.textContent = `VIEW: ${{ first: "1ST", top: "TOP", third: "3RD" }[mode] ?? "3RD"}`;
    cross.style.display = mode === "first" ? "block" : "none";
    zoomIn.parentElement.style.visibility = mode === "first" ? "hidden" : "visible";
    if (onToggle) view.onclick = onToggle;
  },
  setZoom(onIn, onOut) {
    const { zoomIn, zoomOut } = ensure();
    zoomIn.onclick = onIn;
    zoomOut.onclick = onOut;
  },
  setCharge(fraction) {
    const { charge, chargeBar } = ensure();
    charge.style.display = fraction === null ? "none" : "block";
    if (fraction !== null) chargeBar.style.width = `${Math.round(fraction * 100)}%`;
  },
  showLoading(text) {
    let el = document.getElementById("hud-loading");
    if (!text) { el?.remove(); return; }
    if (!el) {
      el = Object.assign(document.createElement("div"), { id: "hud-loading" });
      el.style.cssText = "position:absolute;inset:0;display:grid;place-items:center;color:#ffd23f;font-family:'Press Start 2P',monospace;font-size:16px;line-height:1.8;text-align:center;text-shadow:3px 3px 0 #b53d1a;";
      root().appendChild(el);
    }
    el.textContent = text;
  },
};

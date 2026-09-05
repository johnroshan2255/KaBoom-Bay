import { CHAT_HISTORY, CHAT_MAX_LEN, QUICK_CHAT, TEAM_COLORS, PLAYER_COLORS } from "@kaboom-bay/shared";

const hex = (c) => `#${c.toString(16).padStart(6, "0")}`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * In-game chat: a small pixel panel above the scoreboard. Enter opens the box on desktop; on touch the
 * CHAT button opens it with one-tap quick phrases. Lines fade after a while unless the box is open.
 * In teams mode a TEAM / ALL toggle picks the channel. Hidden entirely when the portal disables chat.
 */
export class ChatPanel {
  constructor({ onSend, teams = false }) {
    this.onSend = onSend;
    this.teams = teams;
    this.teamOnly = teams;
    this.el = document.createElement("div");
    this.el.className = "chatpanel";
    this.el.innerHTML = `<style>
      .chatpanel { position:absolute; left:12px; bottom:calc(30px + var(--board-h, 136px)); width:min(360px, 46vw); z-index:5; font-family:"Press Start 2P", monospace; pointer-events:none; }
      .chatpanel .log { display:flex; flex-direction:column; gap:4px; margin-bottom:6px; }
      .chatpanel .line { font-size:8px; line-height:1.5; color:#fff; padding:5px 8px 4px; background:rgba(8,33,48,.82); border:2px solid #1a4a5f; transition:opacity .6s; word-break:break-word; }
      .chatpanel .line.faded { opacity:0; }
      .chatpanel .line b { margin-right:6px; }
      .chatpanel .line .sq { display:inline-block; width:7px; height:7px; margin-right:5px; vertical-align:-1px; box-shadow: 0 0 0 1px #062a3a; }
      .chatpanel .line .scope { color:#a9d6e6; font-size:6px; margin-left:6px; }
      .chatpanel .box { display:none; pointer-events:auto; background:#0f3446; border:3px solid #f1d48e; box-shadow: 0 4px 0 #6d4320; padding:6px; }
      .chatpanel.open .box { display:block; }
      .chatpanel .row { display:flex; gap:6px; }
      .chatpanel input { flex:1; min-width:0; font:9px/1.4 "Press Start 2P", monospace; color:#fff; background:#082130; border:2px solid #1fb6dc; padding:8px; outline:none; }
      .chatpanel button { font:8px "Press Start 2P", monospace; color:#062a3a; background:#1fb6dc; border:2px solid #062a3a; padding:8px 9px 7px; cursor:pointer; box-shadow:0 3px 0 #0e7fa3; }
      .chatpanel button:active { transform:translateY(2px); box-shadow:none; }
      .chatpanel button.team { background:#ff5c5c; color:#fff; } .chatpanel button.team.all { background:#62d26f; color:#0d3b1a; }
      .chatpanel .quick { display:flex; flex-wrap:wrap; gap:5px; margin-top:6px; }
      .chatpanel .quick button { background:#082130; color:#a9d6e6; border-color:#1a4a5f; box-shadow:0 2px 0 #041520; font-size:7px; padding:6px 7px 5px; }
      .chatpanel .hint { font-size:6px; color:#7fb6c9; margin-top:5px; }
      @media (max-width: 900px) { .chatpanel { left:12px; bottom:auto; top:44%; width:min(300px, 40vw); } .chatpanel .line { font-size:7px; } }
      /* touch: under the compact scoreboard in the top-left corner, small lines that fade quickly */
      @media (pointer: coarse) {
        .chatpanel { left:6px; bottom:auto; top:104px; width:min(280px, 36vw); }
        .chatpanel .line { font-size:6px; padding:3px 5px 2px; }
        .chatpanel .box { padding:4px; } .chatpanel input { font-size:8px; padding:6px; } .chatpanel button { font-size:7px; padding:6px 7px 5px; }
        .chatpanel .quick button { font-size:6px; padding:4px 5px 3px; } .chatpanel .hint { display:none; }
      }
    </style>
    <div class="log" data-log></div>
    <div class="box">
      <div class="row">${teams ? `<button class="team" data-scope title="Who sees it">TEAM</button>` : ""}<input maxlength="${CHAT_MAX_LEN}" placeholder="Say something..." aria-label="Chat message" autocomplete="off" spellcheck="false" /><button data-send>SEND</button><button data-close title="Close">X</button></div>
      <div class="quick">${QUICK_CHAT.map((q) => `<button data-quick="${esc(q)}">${esc(q)}</button>`).join("")}</div>
      <div class="hint">ENTER SENDS &middot; ESC CLOSES &middot; MESSAGES ARE FILTERED</div>
    </div>`;
    document.getElementById("ui").appendChild(this.el);
    this.log = this.el.querySelector("[data-log]");
    this.input = this.el.querySelector("input");
    this.scopeBtn = this.el.querySelector("[data-scope]");
    this.el.querySelector("[data-send]").addEventListener("click", () => this.send());
    this.el.querySelector("[data-close]").addEventListener("click", () => this.close());
    this.el.querySelectorAll("[data-quick]").forEach((b) => b.addEventListener("click", () => { this.onSend(b.dataset.quick, this.teamOnly); this.close(); }));
    this.scopeBtn?.addEventListener("click", () => { this.teamOnly = !this.teamOnly; this.scopeBtn.textContent = this.teamOnly ? "TEAM" : "ALL"; this.scopeBtn.classList.toggle("all", !this.teamOnly); this.input.focus(); });
    this.input.addEventListener("keydown", (e) => {
      e.stopPropagation(); // typing must never move the hero or place pieces
      if (e.key === "Enter") { e.preventDefault(); this.send(); }
      else if (e.key === "Escape") { e.preventDefault(); this.close(); }
    });
    this.input.addEventListener("keyup", (e) => e.stopPropagation());
    this.timers = new Set();
  }

  get isOpen() { return this.el.classList.contains("open"); }
  open() { this.el.classList.add("open"); this.input.focus(); for (const l of this.log.children) l.classList.remove("faded"); }
  close() { this.el.classList.remove("open"); this.input.blur(); for (const l of this.log.children) if (l.dataset.expired) l.classList.add("faded"); } // old lines go back to hidden
  toggle() { this.isOpen ? this.close() : this.open(); }

  send() {
    const text = this.input.value.trim();
    if (!text) { this.close(); return; }
    this.onSend(text, this.teamOnly);
    this.input.value = "";
    this.close();
  }

  /** msg: { name, islandIndex, team, text, scope }, mine: boolean, teamsMode: colour by team instead of island */
  add(msg, { mine = false, teamsMode = false } = {}) {
    const color = teamsMode ? hex(TEAM_COLORS[msg.team % TEAM_COLORS.length]) : hex(PLAYER_COLORS[msg.islandIndex % PLAYER_COLORS.length]);
    const line = document.createElement("div");
    line.className = "line";
    line.innerHTML = `<span class="sq" style="background:${color}"></span><b style="color:${color}">${esc(msg.name)}${mine ? " (you)" : ""}</b>${esc(msg.text)}${msg.scope === "team" ? `<span class="scope">TEAM</span>` : ""}`;
    this.log.appendChild(line);
    while (this.log.children.length > CHAT_HISTORY) this.log.firstChild.remove();
    const t = setTimeout(() => { line.dataset.expired = "1"; if (!this.isOpen) line.classList.add("faded"); }, matchMedia("(pointer: coarse)").matches ? 6000 : 12000);
    this.timers.add(t);
  }

  dispose() {
    for (const t of this.timers) clearTimeout(t);
    this.el.remove();
  }
}

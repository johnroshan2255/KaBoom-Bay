/**
 * On-screen controls for phones and tablets: a virtual joystick, a look zone for first person,
 * and context buttons (THROW / GRAB in combat, PLACE / REMOVE / ROTATE while building, VIEW).
 * Only created on coarse-pointer devices.
 */
export const isTouchDevice = () => matchMedia("(pointer: coarse)").matches || (navigator.maxTouchPoints > 0 && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent));

export class TouchControls {
  constructor(handlers) {
    this.h = handlers;
    this.el = document.createElement("div");
    this.el.id = "touch";
    this.el.innerHTML = `<style>
      #touch { position:fixed; inset:0; pointer-events:none; font-family:"Press Start 2P", monospace; user-select:none; -webkit-user-select:none; }
      #touch .look { position:absolute; top:0; right:0; bottom:0; width:58%; pointer-events:none; touch-action:none; }
      #touch .look.on { pointer-events:auto; }
      #touch .joy { position:absolute; left:calc(18px + env(safe-area-inset-left)); bottom:calc(18px + env(safe-area-inset-bottom)); width:124px; height:124px; border-radius:50%; background:rgba(8,33,48,.55); border:3px solid #f1d48e; pointer-events:auto; touch-action:none; }
      #touch .joy i { position:absolute; left:50%; top:50%; width:52px; height:52px; margin:-26px; border-radius:50%; background:#1fb6dc; border:3px solid #062a3a; box-shadow: inset -5px -5px 0 rgba(0,0,0,.3); }
      #touch .btns { position:absolute; right:calc(16px + env(safe-area-inset-right)); bottom:calc(18px + env(safe-area-inset-bottom)); display:grid; grid-template-columns:auto auto; gap:10px; align-items:end; justify-items:end; pointer-events:none; }
      #touch button { pointer-events:auto; touch-action:none; font:inherit; font-size:9px; color:#062a3a; border:3px solid #062a3a; padding:0; width:64px; height:64px; border-radius:50%; background:#62d26f; box-shadow:0 5px 0 #2e9e4f; }
      #touch button:active, #touch button.held { transform:translateY(4px); box-shadow:0 1px 0 #2e9e4f; }
      #touch button.action { width:86px; height:86px; font-size:11px; background:#ff6b3d; box-shadow:0 5px 0 #b53d1a; color:#fff; }
      #touch button.action:active, #touch button.action.held { box-shadow:0 1px 0 #b53d1a; }
      #touch button.sec { background:#1fb6dc; box-shadow:0 5px 0 #0e7fa3; }
      #touch button.sec:active { box-shadow:0 1px 0 #0e7fa3; }
      #touch button.rot { background:#ffd23f; box-shadow:0 5px 0 #b58a1a; }
      #touch button[hidden] { display:none; }
      #touch .zoom { position:absolute; right:calc(12px + env(safe-area-inset-right)); top:158px; display:flex; gap:6px; }
      #touch .zoom button { width:40px; height:36px; border-radius:0; font-size:12px; background:#0f3446; color:#fff; border:3px solid #f1d48e; box-shadow:0 4px 0 #6d4320; }
      #touch .view { position:absolute; right:calc(12px + env(safe-area-inset-right)); top:110px; width:auto; height:auto; border-radius:0; padding:8px 10px 7px; background:#0f3446; color:#fff; border:3px solid #f1d48e; box-shadow:0 4px 0 #6d4320; font-size:9px; }
    </style>
    <div class="look" data-look></div>
    <div class="joy" data-joy><i></i></div>
    <div class="btns">
      <button class="rot" data-rotate hidden>ROT</button>
      <button class="sec" data-sec>GRAB</button>
      <button class="action" data-action>THROW</button>
    </div>
    <button class="view" data-view>VIEW</button>
    <div class="zoom" data-zoom><button data-zin>+</button><button data-zout>-</button></div>`;
    document.body.appendChild(this.el);

    const q = (sel) => this.el.querySelector(sel);
    this.look = q("[data-look]");
    this.joy = q("[data-joy]");
    this.knob = q("[data-joy] i");
    this.action = q("[data-action]");
    this.sec = q("[data-sec]");
    this.rot = q("[data-rotate]");
    this.view = q("[data-view]");

    // joystick
    let joyId = null, cx = 0, cy = 0;
    this.joy.addEventListener("pointerdown", (e) => { joyId = e.pointerId; const r = this.joy.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; this.joy.setPointerCapture(e.pointerId); });
    this.joy.addEventListener("pointermove", (e) => {
      if (e.pointerId !== joyId) return;
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const len = Math.hypot(dx, dy), max = 44;
      if (len > max) { dx *= max / len; dy *= max / len; }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.h.onMove?.(dx / max, -dy / max);
    });
    const joyEnd = (e) => { if (e.pointerId !== joyId) return; joyId = null; this.knob.style.transform = ""; this.h.onMove?.(0, 0); };
    this.joy.addEventListener("pointerup", joyEnd);
    this.joy.addEventListener("pointercancel", joyEnd);

    // look zone (first person)
    let lookId = null, lx = 0, ly = 0;
    this.look.addEventListener("pointerdown", (e) => { lookId = e.pointerId; lx = e.clientX; ly = e.clientY; this.look.setPointerCapture(e.pointerId); });
    this.look.addEventListener("pointermove", (e) => { if (e.pointerId !== lookId) return; this.h.onLook?.((e.clientX - lx) * 2.2, (e.clientY - ly) * 2.2); lx = e.clientX; ly = e.clientY; });
    const lookEnd = (e) => { if (e.pointerId === lookId) lookId = null; };
    this.look.addEventListener("pointerup", lookEnd);
    this.look.addEventListener("pointercancel", lookEnd);

    // buttons
    this.action.addEventListener("pointerdown", (e) => { e.preventDefault(); this.action.classList.add("held"); this.h.onAction?.("down"); });
    const actionUp = () => { if (this.action.classList.contains("held")) { this.action.classList.remove("held"); this.h.onAction?.("up"); } };
    this.action.addEventListener("pointerup", actionUp);
    this.action.addEventListener("pointercancel", actionUp);
    this.sec.addEventListener("click", () => this.h.onSecondary?.());
    this.rot.addEventListener("click", () => this.h.onRotate?.());
    this.view.addEventListener("click", () => this.h.onView?.());
    q("[data-zin]").addEventListener("click", () => this.h.onZoom?.(1));
    q("[data-zout]").addEventListener("click", () => this.h.onZoom?.(-1));
    this.zoom = q("[data-zoom]");
  }

  /** phase: "build" | "combat" | other; mode: "first" | "third" */
  setContext({ phase, mode }) {
    const combat = phase === "combat", build = phase === "build";
    this.action.textContent = combat ? "THROW" : "PLACE";
    this.sec.textContent = combat ? "GRAB" : "REMOVE";
    this.action.hidden = !(combat || build);
    this.sec.hidden = !(combat || build);
    this.rot.hidden = !build;
    this.look.classList.toggle("on", mode === "first");
    this.view.textContent = { third: "3RD", top: "TOP", first: "1ST" }[mode] ?? "3RD";
    this.zoom.style.visibility = mode === "first" ? "hidden" : "visible";
  }

  dispose() { this.el.remove(); }
}

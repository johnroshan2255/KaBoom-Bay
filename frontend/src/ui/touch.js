/**
 * On-screen controls for phones and tablets: a virtual joystick, a full-screen look zone for first person
 * (third person / top view rotate by dragging the canvas directly), context buttons (THROW / GRAB in combat,
 * PLACE / REMOVE / ROTATE while building, JUMP in both), CHAT and a settings gear.
 * THROW is an aim stick: drag away from the button to aim (direction = throw direction on screen, distance =
 * power, with the landing preview in the world), release to throw; a plain tap lobs forward. One thumb does it all.
 * Only created on coarse-pointer devices.
 */
export const isTouchDevice = () => matchMedia("(pointer: coarse)").matches || (navigator.maxTouchPoints > 0 && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent));

/**
 * Phones: go full screen and stay landscape. Must run inside a tap handler (PLAY); every step is optional
 * and silently skipped where the browser or the portal's iframe doesn't allow it.
 */
export function enterFullscreen() {
  try {
    const el = document.documentElement;
    if (document.fullscreenElement || !el.requestFullscreen) return;
    el.requestFullscreen({ navigationUI: "hide" }).then(() => screen.orientation?.lock?.("landscape").catch(() => {})).catch(() => {});
  } catch { /* not available here */ }
}

export class TouchControls {
  constructor(handlers) {
    this.h = handlers;
    this.el = document.createElement("div");
    this.el.id = "touch";
    this.el.innerHTML = `<style>
      #touch[hidden] { display:none; }
      #touch { position:fixed; inset:0; height:100%; height:var(--vh, 100dvh); z-index:1; pointer-events:none; font-family:"Press Start 2P", monospace; user-select:none; -webkit-user-select:none; }
      #touch .look { position:absolute; inset:0; pointer-events:none; touch-action:none; }
      #touch .look.on { pointer-events:auto; }
      /* phones are short (320-420px tall in landscape): controls stay small so the bay stays visible */
      #touch .joy { position:absolute; left:calc(12px + env(safe-area-inset-left)); bottom:calc(12px + env(safe-area-inset-bottom)); width:96px; height:96px; border-radius:50%; background:rgba(8,33,48,.45); border:3px solid rgba(241,212,142,.85); pointer-events:auto; touch-action:none; }
      #touch .joy i { position:absolute; left:50%; top:50%; width:40px; height:40px; margin:-20px; border-radius:50%; background:#1fb6dc; border:3px solid #062a3a; box-shadow: inset -4px -4px 0 rgba(0,0,0,.3); }
      #touch .btns { position:absolute; right:calc(12px + env(safe-area-inset-right)); bottom:calc(12px + env(safe-area-inset-bottom)); display:grid; grid-template-areas:"rot sec" "jump action"; gap:8px; align-items:end; justify-items:end; pointer-events:none; }
      #touch .btns [data-rotate] { grid-area:rot; } #touch .btns [data-sec] { grid-area:sec; } #touch .btns [data-jump] { grid-area:jump; } #touch .btns [data-action] { grid-area:action; }
      #touch button { pointer-events:auto; touch-action:none; font:inherit; font-size:8px; color:#062a3a; border:3px solid #062a3a; padding:0; width:54px; height:54px; border-radius:50%; background:#62d26f; box-shadow:0 4px 0 #2e9e4f; }
      #touch button:active, #touch button.held { transform:translateY(3px); box-shadow:0 1px 0 #2e9e4f; }
      #touch button.action { width:72px; height:72px; font-size:10px; background:#ff6b3d; box-shadow:0 4px 0 #b53d1a; color:#fff; }
      #touch button.action:active, #touch button.action.held { box-shadow:0 1px 0 #b53d1a; }
      #touch button.sec { background:#1fb6dc; box-shadow:0 5px 0 #0e7fa3; }
      #touch button.sec:active { box-shadow:0 1px 0 #0e7fa3; }
      #touch button.rot { background:#ffd23f; box-shadow:0 5px 0 #b58a1a; }
      #touch button[hidden] { display:none; }
      @media (max-height: 360px) { /* iPhone SE landscape (320px): tighter still */
        #touch .joy { width:84px; height:84px; } #touch .joy i { width:36px; height:36px; margin:-18px; }
        #touch .btns { gap:6px; }
        #touch .btns button { width:48px; height:48px; font-size:6px; }
        #touch .btns button.action { width:64px; height:64px; font-size:9px; }
      }
      /* CHAT and the settings gear sit under the phase timer in the top-right corner */
      #touch .top { position:absolute; right:calc(6px + env(safe-area-inset-right)); top:34px; display:flex; gap:4px; align-items:stretch; pointer-events:none; }
      #touch .zoom { display:flex; gap:6px; }
      #touch .zoom[hidden] { display:none; } /* zoom lives in the settings panel now; the author display would otherwise beat the hidden attribute */
      #touch .zoom button { width:40px; height:36px; border-radius:0; font-size:12px; background:#0f3446; color:#fff; border:3px solid #f1d48e; box-shadow:0 4px 0 #6d4320; }
      #touch .view { width:auto; height:28px; border-radius:0; padding:6px 8px 5px; background:#0f3446; color:#fff; border:2px solid #f1d48e; box-shadow:0 3px 0 #6d4320; font-size:7px; }
      #touch .gear { width:32px; font-size:13px; padding:0; }
      /* aim stick: ring around THROW while dragging, knob under the thumb */
      #touch .aim { position:absolute; display:none; width:160px; height:160px; margin:-80px; border-radius:50%; border:3px dashed rgba(241,212,142,.8); background:rgba(8,33,48,.25); pointer-events:none; }
      #touch .aim.on { display:block; }
      #touch .aim i { position:absolute; left:50%; top:50%; width:30px; height:30px; margin:-15px; border-radius:50%; background:#ffd23f; border:3px solid #062a3a; box-shadow: inset -4px -4px 0 rgba(0,0,0,.3); }
      #touch .aim b { position:absolute; left:50%; top:50%; height:4px; margin-top:-2px; transform-origin:0 50%; background:rgba(255,210,63,.7); }
    </style>
    <div class="aim" data-aim><b></b><i></i></div>
    <div class="look" data-look></div>
    <div class="joy" data-joy><i></i></div>
    <div class="btns">
      <button class="rot" data-rotate hidden>ROT</button>
      <button class="sec" data-sec>GRAB</button>
      <button data-jump>JUMP</button>
      <button class="action" data-action>THROW</button>
    </div>
    <div class="top">
      <div class="zoom" data-zoom><button data-zin>+</button><button data-zout>-</button></div>
      <button class="view chat" data-chat title="Chat">CHAT</button>
      <button class="view gear" data-gear title="Settings" aria-label="Settings">&#9881;</button>
    </div>`;
    document.body.appendChild(this.el);

    const q = (sel) => this.el.querySelector(sel);
    this.look = q("[data-look]");
    this.joy = q("[data-joy]");
    this.knob = q("[data-joy] i");
    this.action = q("[data-action]");
    this.sec = q("[data-sec]");
    this.rot = q("[data-rotate]");
    this.gear = q("[data-gear]");
    this.aim = q("[data-aim]");
    this.aimKnob = q("[data-aim] i");
    this.aimLine = q("[data-aim] b");
    this.chatBtn = q("[data-chat]");
    this.combat = false;

    // joystick
    let joyId = null, cx = 0, cy = 0;
    this.joy.addEventListener("pointerdown", (e) => { joyId = e.pointerId; const r = this.joy.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; try { this.joy.setPointerCapture(e.pointerId); } catch { /* synthetic event */ } });
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
    this.look.addEventListener("pointerdown", (e) => { lookId = e.pointerId; lx = e.clientX; ly = e.clientY; try { this.look.setPointerCapture(e.pointerId); } catch { /* synthetic event */ } });
    this.look.addEventListener("pointermove", (e) => { if (e.pointerId !== lookId) return; this.h.onLook?.((e.clientX - lx) * 2.2, (e.clientY - ly) * 2.2); lx = e.clientX; ly = e.clientY; });
    const lookEnd = (e) => { if (e.pointerId === lookId) lookId = null; };
    this.look.addEventListener("pointerup", lookEnd);
    this.look.addEventListener("pointercancel", lookEnd);

    // THROW / PLACE. In combat the button doubles as an aim stick (see the class comment).
    const AIM_RADIUS = 70, DEADZONE = 14;
    let actId = null, ax = 0, ay = 0, aimed = false;
    this.action.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      actId = e.pointerId; aimed = false;
      const r = this.action.getBoundingClientRect(); ax = r.left + r.width / 2; ay = r.top + r.height / 2;
      if (this.combat) { this.aim.style.left = `${ax}px`; this.aim.style.top = `${ay}px`; }
      try { this.action.setPointerCapture(e.pointerId); } catch { /* synthetic event */ }
      this.action.classList.add("held");
      this.h.onAction?.("down");
    });
    this.action.addEventListener("pointermove", (e) => {
      if (e.pointerId !== actId || !this.combat) return;
      let dx = e.clientX - ax, dy = e.clientY - ay;
      const len = Math.hypot(dx, dy);
      if (!aimed && len < DEADZONE) return;
      aimed = true;
      this.aim.classList.add("on");
      if (len > AIM_RADIUS) { dx *= AIM_RADIUS / len; dy *= AIM_RADIUS / len; }
      this.aimKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.aimLine.style.width = `${Math.hypot(dx, dy)}px`;
      this.aimLine.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
      this.h.onAim?.(dx / AIM_RADIUS, -dy / AIM_RADIUS); // screen right = +x, screen up = +y
    });
    const actionUp = (e) => {
      if (e.pointerId !== actId) return;
      actId = null;
      this.aim.classList.remove("on");
      this.aimKnob.style.transform = "";
      if (this.action.classList.contains("held")) { this.action.classList.remove("held"); this.h.onAction?.("up", { aimed }); }
    };
    this.action.addEventListener("pointerup", actionUp);
    this.action.addEventListener("pointercancel", actionUp);
    this.sec.addEventListener("click", () => this.h.onSecondary?.());
    this.jumpBtn = q("[data-jump]");
    this.jumpBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); this.h.onJump?.(); }); // on press, not click: no delay under a moving thumb
    this.rot.addEventListener("click", () => this.h.onRotate?.());
    this.gear.addEventListener("click", () => this.h.onSettings?.());
    this.chatBtn.addEventListener("click", () => this.h.onChat?.());
    q("[data-zin]").addEventListener("click", () => this.h.onZoom?.(1));
    q("[data-zout]").addEventListener("click", () => this.h.onZoom?.(-1));
    this.zoom = q("[data-zoom]");
  }

  /**
   * phase: "build" | "combat" | other; mode: "first" | "third"; secondary: label of the second button in combat
   * ("GRAB" / "DROP" for the flag in capture the flag) or null to hide it (bombs are picked up by walking over them).
   */
  setContext({ phase, mode, secondary = null }) {
    const combat = phase === "combat", build = phase === "build";
    this.combat = combat;
    this.el.hidden = !(combat || build); // no joystick over the lobby / results panels
    this.action.textContent = combat ? "THROW" : "PLACE";
    this.sec.textContent = combat ? (secondary ?? "") : "REMOVE";
    this.action.hidden = !(combat || build);
    this.sec.hidden = !(build || (combat && !!secondary));
    this.jumpBtn.hidden = !(combat || build);
    this.rot.hidden = !build;
    this.look.classList.toggle("on", mode === "first");
    this.zoom.hidden = true; // zoom moved into the settings panel; kept in the DOM for the layout tests
  }

  dispose() { this.el.remove(); }
}

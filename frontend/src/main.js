import { NetworkClient } from "./net/client.js";
import { Match } from "./game/Match.js";
import { hud } from "./ui/hud.js";
import { lobby, randomName, savedMode } from "./ui/lobby.js";
import { cg } from "./platform/crazygames.js";
import { sound } from "./audio/Sound.js";
import { siteAllowed } from "./platform/sitelock.js";

// CrazyGames "common fixes": arrows / space must not scroll or click focused buttons, no context menu anywhere.
window.addEventListener("keydown", (e) => {
  const typing = e.target?.tagName === "INPUT" || e.target?.tagName === "TEXTAREA";
  if (!typing && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
}, { passive: false });
document.addEventListener("contextmenu", (e) => e.preventDefault());

/**
 * Entry point. Default: menu (name + mode) -> online match; empty islands are filled by bots, so a solo
 * player can start right away from the lobby.
 * `?sandbox` boots the offline Phase 1 sandbox instead (add `&seed=N` for a fixed island).
 */
const params = new URLSearchParams(location.search);
const canvas = document.getElementById("game");
const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? `ws://${location.hostname}:2567`;

if (!siteAllowed()) {
  hud.showLoading("KaBoom Bay is only available on CrazyGames.");
} else if (params.has("sandbox")) {
  hud.showLoading("Loading sandbox…");
  const { Sandbox } = await import("./game/Sandbox.js");
  const seed = params.get("seed") ? Number(params.get("seed")) : Date.now() % 100000;
  Sandbox.create(canvas, { seed }).then(() => hud.showLoading(null)).catch(fail);
} else {
  await cg.init();
  cg.loadingStart();
  hud.setCoins(0);
  // portal mute setting overrides the in-game toggle
  const applyPortalSettings = (s) => { if (s && typeof s.muteAudio === "boolean") sound.setPortalMuted(s.muteAudio); };
  applyPortalSettings(cg.settings());
  cg.onSettingsChange(applyPortalSettings);
  const net = new NetworkClient(SERVER_URL);
  let match = null;
  // a join code arrives through a shared link (?code=XXXXX) or a CrazyGames invite
  const inviteCode = (cg.inviteParam("code") ?? params.get("code") ?? "").toUpperCase() || null;
  const CODE_ERRORS = { not_found: "No room with that code. Check the code or ask the host for a new link.", started: "That match has already started.", full: "That room is full.", offline: "Could not reach the game server." };
  let lastName = null;
  const showMenu = (opts = {}) => lobby.showMenu({
    defaultName: lastName ?? defaultName,
    defaultMode: inviteMode ?? savedMode(),
    inviteCode: opts.inviteCode ?? null,
    onPlay: (name, mode) => play(name, { mode }),
    onQuick: (name, mode) => play(name, { mode, quick: true }),
    onHost: (name, mode) => play(name, { mode, host: true }),
    onJoinCode: (name, code) => play(name, { code }),
  });
  const play = async (name, { mode = savedMode(), quick = false, host = false, code = null } = {}) => {
    lastName = name;
    lobby.showConnecting(code ? `JOINING ROOM ${code}` : host ? "OPENING YOUR ROOM" : quick ? "LOOKING FOR AN OPEN BAY" : "FINDING A BAY");
    try {
      match?.dispose();
      await net.leave();
      await net.joinMatch({ name, mode, quick, host, code });
      match = new Match(canvas, net, {
        onPlayAgain: () => play(name, { mode }),
        onLeave: async () => { match?.dispose(); match = null; await net.leave(); showMenu(); },
      });
      if (import.meta.env.DEV) window.__match = match;
    } catch (err) {
      console.error("[KaBoom Bay] join failed", err);
      const msg = code ? (CODE_ERRORS[err.code] ?? CODE_ERRORS.not_found) : `Could not reach the game server (${SERVER_URL}).`;
      lobby.showError(msg, () => showMenu());
    }
  };
  const defaultName = params.get("name") ?? (await cg.userName()) ?? randomName();
  const inviteMode = cg.inviteParam("mode") ?? params.get("mode");
  cg.loadingStop();
  if (inviteCode) showMenu({ inviteCode });
  else if (cg.isInstantMultiplayer()) play(defaultName); // portal launched us into multiplayer: straight to a public bay
  else showMenu({});
  if (import.meta.env.DEV) window.__play = play;
}

function fail(err) {
  console.error("[KaBoom Bay] failed to boot", err);
  hud.showLoading("Something went wrong loading the game. Check the console.");
}

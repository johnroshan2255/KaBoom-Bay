import { NetworkClient } from "./net/client.js";
import { Match } from "./game/Match.js";
import { hud } from "./ui/hud.js";
import { lobby, randomName } from "./ui/lobby.js";
import { cg } from "./platform/crazygames.js";
import { sound } from "./audio/Sound.js";

/**
 * Entry point. Default: lobby -> online match (Phase 3).
 * `?sandbox` boots the offline Phase 1 sandbox instead (add `&seed=N` for a fixed island).
 */
const params = new URLSearchParams(location.search);
const canvas = document.getElementById("game");
const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? `ws://${location.hostname}:2567`;

if (params.has("sandbox")) {
  hud.showLoading("Loading sandbox…");
  const { Sandbox } = await import("./game/Sandbox.js");
  const seed = params.get("seed") ? Number(params.get("seed")) : Date.now() % 100000;
  Sandbox.create(canvas, { seed }).then(() => hud.showLoading(null)).catch(fail);
} else {
  await cg.init();
  cg.loadingStart();
  hud.setCoins(0);
  const net = new NetworkClient(SERVER_URL);
  let match = null;
  const inviteRoom = cg.inviteParam("room") ?? params.get("room");
  const play = async (name, { roomId = null } = {}) => {
    lobby.showConnecting();
    try {
      match?.dispose();
      await net.leave();
      await net.joinMatch({ name, roomId });
      match = new Match(canvas, net, {
        onPlayAgain: async () => {
          await cg.midgameAd({ onStart: () => sound.duck(true), onEnd: () => sound.duck(false) });
          play(name);
        },
      });
      if (import.meta.env.DEV) window.__match = match;
    } catch (err) {
      console.error("[KaBoom Bay] join failed", err);
      lobby.showError(`Could not reach the game server (${SERVER_URL}).`, () => play(name));
    }
  };
  const defaultName = params.get("name") ?? (await cg.userName()) ?? randomName();
  lobby.showMenu({ defaultName, onPlay: (name) => play(name, { roomId: inviteRoom }) });
  cg.loadingStop();
  if (import.meta.env.DEV) window.__play = play;
}

function fail(err) {
  console.error("[KaBoom Bay] failed to boot", err);
  hud.showLoading("Something went wrong loading the game. Check the console.");
}

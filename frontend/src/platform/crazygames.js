/**
 * Thin wrapper over the CrazyGames HTML5 SDK v3. Every call is a safe no-op when the SDK is not
 * present (local dev, other portals), so the game never depends on it being loaded.
 */
const sdk = () => {
  const S = window.CrazyGames?.SDK ?? null;
  return S && S.environment !== "disabled" ? S : null; // outside the portal every SDK call throws: treat as absent
};

export const cg = {
  ready: false,
  isPortal: () => !!window.CrazyGames,

  async init() {
    const S = sdk();
    if (!S) return false;
    try { await S.init(); this.ready = true; } catch (e) { console.warn("[cg] init failed", e?.message ?? e); }
    return this.ready;
  },

  loadingStart() { try { this.ready && sdk()?.game.loadingStart(); } catch { /* ignore */ } },
  loadingStop() { try { this.ready && sdk()?.game.loadingStop(); } catch { /* ignore */ } },
  gameplayStart() { try { this.ready && sdk()?.game.gameplayStart(); } catch { /* ignore */ } },
  gameplayStop() { try { this.ready && sdk()?.game.gameplayStop(); } catch { /* ignore */ } },
  happytime() { try { this.ready && sdk()?.game.happytime(); } catch { /* ignore */ } },

  /** Shows a midgame ad between matches. Resolves when the ad is over (or immediately without SDK). */
  midgameAd({ onStart, onEnd } = {}) {
    const S = sdk();
    if (!this.ready || !S) return Promise.resolve(false);
    return new Promise((resolve) => {
      let done = false;
      const finish = (shown) => { if (done) return; done = true; onEnd?.(); resolve(shown); };
      try {
        S.ad.requestAd("midgame", { adStarted: () => onStart?.(), adFinished: () => finish(true), adError: () => finish(false) });
      } catch { finish(false); }
    });
  },

  async userName() {
    try { const u = await sdk()?.user.getUser(); return u?.username ?? null; } catch { return null; }
  },

  inviteParam(name) {
    try { return sdk()?.game.getInviteParam(name) ?? null; } catch { return null; }
  },

  inviteLink(params) {
    try { return sdk()?.game.inviteLink(params) ?? null; } catch { return null; }
  },

  /** Portal "invite friends" button while the player sits in a joinable room; hide it once the room can't be joined. */
  showInviteButton(params) {
    try { return this.ready ? sdk()?.game.showInviteButton(params) ?? null : null; } catch { return null; }
  },
  hideInviteButton() {
    try { this.ready && sdk()?.game.hideInviteButton(); } catch { /* ignore */ }
  },

  /** The portal launched this game straight into multiplayer (friend invite flow): skip the menu. */
  isInstantMultiplayer() {
    try { return !!sdk()?.game.isInstantMultiplayer; } catch { return false; }
  },

  /** Portal settings: `muteAudio` must override the in-game toggle. onChange(settings) fires on every change. */
  settings() {
    try { return sdk()?.game.settings ?? null; } catch { return null; }
  },
  onSettingsChange(onChange) {
    try { sdk()?.game.addSettingsChangeListener?.(onChange); } catch { /* ignore */ }
  },
};

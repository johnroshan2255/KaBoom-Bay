/**
 * Sitelock (CrazyGames requirement): the production build only runs on CrazyGames domains, the CrazyGames
 * apps and local development hosts. Set VITE_SITELOCK=off at build time to host the client elsewhere.
 * Uses the hostname check from the CrazyGames docs: "crazygames" must be one of the last three labels.
 */
export function siteAllowed() {
  if (import.meta.env.DEV || import.meta.env.VITE_SITELOCK === "off") return true;
  const { hostname, protocol } = window.location;
  if (protocol === "capacitor:" || protocol === "file:") return true; // iOS app shell
  if (["localhost", "127.0.0.1", "::1"].includes(hostname) || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(hostname)) return true;
  const parts = hostname.split(".");
  const idx = parts.indexOf("crazygames");
  return idx !== -1 && idx >= parts.length - 3;
}

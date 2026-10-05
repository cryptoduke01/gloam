/*
 * Recording demo. Open any app page with `?demo=1` and, for that tab only, the
 * app shows a pretend funded wallet on both networks and every action plays
 * back in the browser: no keys, no proofs, nothing sent on chain or to the
 * relay. `?demo=1` again starts over from a fresh wallet; `?demo=0` (or
 * Disconnect) turns it off. Used to film the pitch. The pretend wallet itself
 * lives in lib/demo.
 *
 * Only on a local dev server, or a deployment built with NEXT_PUBLIC_GLOAM_DEMO=1:
 * on the public site a `?demo=1` link would show a stranger a pretend balance.
 */

const KEY = "gloam_demo";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function demoAllowed(): boolean {
  if (process.env.NEXT_PUBLIC_GLOAM_DEMO === "1") return true;
  const host = window.location.hostname;
  return LOCAL_HOSTS.has(host) || host.endsWith(".localhost");
}

/** Where lib/demo keeps the pretend wallet for this tab (cleared on every switch). */
export const DEMO_STATE_KEY = "gloam_demo_state";

/** Reads the switch, taking `?demo=1|0` from the URL first and then hiding it. */
export function readDemo(): boolean {
  if (typeof window === "undefined" || !demoAllowed()) return false;
  try {
    const url = new URL(window.location.href);
    const flag = url.searchParams.get("demo");
    if (flag !== null) {
      window.sessionStorage.removeItem(DEMO_STATE_KEY);
      if (flag === "0") window.sessionStorage.removeItem(KEY);
      else window.sessionStorage.setItem(KEY, "1");
      url.searchParams.delete("demo");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
    return window.sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function exitDemo() {
  try {
    window.sessionStorage.removeItem(KEY);
    window.sessionStorage.removeItem(DEMO_STATE_KEY);
  } catch {
    /* ignore */
  }
  window.location.reload();
}

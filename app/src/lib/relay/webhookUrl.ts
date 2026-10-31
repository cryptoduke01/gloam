/**
 * What a top-up's webhook URL may be: shared by the app, which says so as it is
 * typed, and the relay, which checks it again before keeping it and resolves it
 * only at delivery (lib/relay/webhook). https on the default port, a real host
 * name, and nothing in it that would make the relay reach inside a network.
 */

const MAX_LENGTH = 512;

/** Host names that only mean something inside a network. */
const LOCAL_HOST = /(^|\.)(localhost|local|localdomain|internal|intranet|lan|home|corp|arpa)$/i;

/** Why the relay won't call this URL, in plain words, or null when it may. */
export function webhookUrlProblem(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_LENGTH) return "Enter an https address.";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "Enter a full https address.";
  }
  if (url.protocol !== "https:") return "The address must start with https://.";
  if (url.username || url.password) return "Take the name and password out of the address.";
  if (url.port) return "Use the standard https port.";
  const host = url.hostname;
  // URL has already turned every spelling of an IPv4 address (hex, octal, a bare number) into dotted digits
  if (host.startsWith("[") || /^[\d.]+$/.test(host)) return "Use a host name, not an IP address.";
  if (!host.includes(".") || LOCAL_HOST.test(host)) return "Use a public host name.";
  return null;
}

"use client";

import { Analytics } from "@vercel/analytics/next";

/**
 * Vercel Web Analytics (cookieless page views). Query strings are dropped
 * before sending, so an older ?proof= or request link never reaches it;
 * request and proof links keep their details after the # anyway.
 */
export function VercelAnalytics() {
  return <Analytics beforeSend={(event) => ({ ...event, url: event.url.split("?")[0]! })} />;
}

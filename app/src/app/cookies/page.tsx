import type { Metadata } from "next";
import { CookiePreferences } from "@/components/CookiePreferences";
import { LegalLayout } from "@/components/LegalLayout";

export const metadata: Metadata = { title: "Cookie Policy" };

export default function CookiesPage() {
  return (
    <LegalLayout title="Cookie Policy" updated="July 14, 2026">
      <p>
        This Cookie Policy explains how Gloam uses cookies and similar
        technologies on gloam.trade.
      </p>
      <h2 className="font-display text-2xl text-white">Your preferences</h2>
      <CookiePreferences />
      <h2 className="font-display text-2xl text-white">What are cookies?</h2>
      <p>
        Cookies are small text files stored on your device. They help sites
        remember preferences and understand how pages are used.
      </p>
      <h2 className="font-display text-2xl text-white">Cookies we use</h2>
      <p>
        <strong className="text-white">Essential.</strong> Required for security,
        load balancing, and storing your cookie preference (for example{" "}
        <code className="text-lime">gloam_cookie_consent</code>). These cannot
        be disabled if you want the site to work correctly.
      </p>
      <p>
        <strong className="text-white">Analytics (optional).</strong> If you
        choose “Accept all,” we may use privacy-respecting analytics to measure
        aggregate traffic (pages, referrers, device type). No analytics load
        until you consent.
      </p>
      <h2 className="font-display text-2xl text-white">Managing cookies</h2>
      <p>
        You can clear site data in your browser, use private mode, or re-open
        the banner by clearing the consent key in local storage. Browser
        settings let you block cookies globally.
      </p>
      <h2 className="font-display text-2xl text-white">Local storage</h2>
      <p>
        We may store non-cookie preferences (such as consent) in local storage
        on your device. This data stays on your device unless you clear it.
      </p>
      <h2 className="font-display text-2xl text-white">Updates</h2>
      <p>
        We may revise this Policy as the product evolves. The “Last updated”
        date will change when we do.
      </p>
      <h2 className="font-display text-2xl text-white">More information</h2>
      <p>
        See our{" "}
        <a href="/privacy" className="text-lime hover:underline">
          Privacy Policy
        </a>
        .
      </p>
    </LegalLayout>
  );
}

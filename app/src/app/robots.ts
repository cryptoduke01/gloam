import type { MetadataRoute } from "next";

const SITE = "https://www.gloam.trade";

/**
 * Crawlers may read the site, docs and app. The API, the admin console and the
 * partner portal stay out; pages that must not show in results (claim links,
 * the vault, merch) say so in their own robots meta.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/partners/dashboard"] }],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}

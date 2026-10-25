import Link from "next/link";
import type { ReactNode } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { getPost, postHref, relatedPosts } from "@/lib/posts";
import { AuthorLine, PostCard, PostMeta } from "./PostCard";
import { PostCover } from "./PostCover";
import { ShareLine } from "./ShareLine";

const SITE = "https://www.gloam.trade";

type LinkItem = { label: string; href: string };

const link =
  "text-foreground underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-foreground";

function LinkList({ title, items }: { title: string; items: LinkItem[] }) {
  return (
    <section aria-label={title} className="mt-16">
      <h2 className="text-[15px] font-medium text-foreground">{title}</h2>
      <ol className="mt-4 space-y-2.5 text-[15px] leading-relaxed text-mute">
        {items.map((s, i) => (
          <li key={s.href} className="flex gap-3">
            <span className="tnum w-5 shrink-0 text-faint">{i + 1}.</span>
            {s.href.startsWith("http") ? (
              <a href={s.href} target="_blank" rel="noreferrer" className={link}>
                {s.label}
              </a>
            ) : (
              <Link href={s.href} className={link}>
                {s.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * The frame every research post shares: the way back to /research, the meta
 * line, title, lede and author, the post's cover, a reading column for the
 * body, then sources, the post's own next step, a share line and two more
 * posts to read. The body is plain elements; .article-prose sets its type.
 */
export function ArticleLayout({
  slug,
  lede,
  caption,
  facts,
  sources,
  actions,
  children,
}: {
  slug: string;
  lede: ReactNode;
  /** One line under the cover. */
  caption?: ReactNode;
  /** A few key facts, shown as a row under the cover. */
  facts?: { k: string; v: string }[];
  /** Sources or further reading, numbered after the body. */
  sources?: { title: string; items: LinkItem[] };
  /** The post's own next step (an app or docs link), after the body. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const post = getPost(slug);
  const related = relatedPosts(slug);
  const url = `${SITE}${postHref(post)}`;

  return (
    <div className="flex min-h-screen flex-col bg-panel text-foreground">
      <Header />

      <main>
        <article>
          <header className="mx-auto max-w-[720px] px-6 pt-8 sm:pt-14">
            <Link
              href="/research"
              className="-ml-2 inline-flex h-10 items-center gap-1.5 rounded-full px-2 text-[14px] text-mute transition-colors hover:text-foreground"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M9.5 3.5L5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Research
            </Link>
            <PostMeta post={post} className="mt-8" />
            <h1 className="t-display-l mt-4 text-balance">{post.title}</h1>
            <div className="mt-5 text-[19px] leading-relaxed text-soft sm:text-[20px]">{lede}</div>
            <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
              <AuthorLine />
              <ShareLine title={post.title} url={url} className="-mr-3" />
            </div>
          </header>

          <figure className="mx-auto mt-10 max-w-[1400px] px-4 sm:mt-14 sm:px-7">
            <PostCover id={post.cover} className="mx-auto max-w-[1200px]" />
            {caption && (
              <figcaption className="mx-auto mt-4 max-w-[60ch] px-2 text-center text-[13.5px] leading-relaxed text-mute">
                {caption}
              </figcaption>
            )}
          </figure>

          <div className="mx-auto max-w-[720px] px-6">
            {facts && (
              <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-5 border-b border-line pb-8 sm:grid-cols-4">
                {facts.map((f) => (
                  <div key={f.k} className="min-w-0">
                    <dt className="text-[13px] text-mute">{f.k}</dt>
                    <dd className="mt-1 text-[15px] leading-snug text-foreground">{f.v}</dd>
                  </div>
                ))}
              </dl>
            )}

            <div className="article-prose mt-12">{children}</div>

            {sources && <LinkList title={sources.title} items={sources.items} />}

            {actions && <div className="mt-12 flex flex-wrap items-center gap-2">{actions}</div>}

            <div className="mt-12 border-t border-line pt-6">
              <ShareLine title={post.title} url={url} className="-ml-3.5" />
            </div>
          </div>
        </article>

        {related.length > 0 && (
          <section aria-labelledby="more-research" className="mx-auto mt-24 max-w-[1200px] px-6 sm:mt-28">
            <div className="flex items-end justify-between gap-4">
              <h2 id="more-research" className="t-display-m">
                More research
              </h2>
              <Link href="/research" className="text-[15px] text-soft transition-colors hover:text-foreground">
                All posts
              </Link>
            </div>
            <ul className="mt-8 grid grid-cols-1 gap-x-6 gap-y-12 sm:grid-cols-2">
              {related.map((p) => (
                <li key={p.slug}>
                  <PostCard post={p} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}

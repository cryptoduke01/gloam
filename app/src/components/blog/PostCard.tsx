import Image from "next/image";
import Link from "next/link";
import { AUTHOR, postHref, type Post } from "@/lib/posts";
import { PostCover } from "./PostCover";

/** Date and reading time, the one meta line every post shows. */
export function PostMeta({ post, className = "" }: { post: Post; className?: string }) {
  return (
    <p className={`tnum flex flex-wrap items-center gap-x-2 text-[13.5px] text-mute ${className}`}>
      <span>{post.kind}</span>
      <span aria-hidden>·</span>
      <time dateTime={post.date}>{post.dateLabel}</time>
      <span aria-hidden>·</span>
      <span>{post.minutes} min read</span>
    </p>
  );
}

export function AuthorLine({ small = false }: { small?: boolean }) {
  const size = small ? 24 : 36;
  return (
    <span className="inline-flex items-center gap-2.5">
      <Image
        src={AUTHOR.avatar}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full bg-surface ring-1 ring-line"
        style={{ width: size, height: size }}
      />
      {small ? (
        <span className="text-[13.5px] text-soft">{AUTHOR.name}</span>
      ) : (
        <span className="leading-tight">
          <a href={AUTHOR.href} target="_blank" rel="noreferrer" className="gl-tap block text-[15px] text-foreground hover:underline">
            {AUTHOR.name}
          </a>
          <span className="block text-[13px] text-mute">{AUTHOR.role}</span>
        </span>
      )}
    </span>
  );
}

/**
 * A post in a grid: its cover, the meta line, the title and one line on it,
 * with the author held to the bottom so a row of cards lines up.
 */
export function PostCard({ post, headingLevel = 3 }: { post: Post; headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  return (
    <Link href={postHref(post)} className="post-card group flex h-full flex-col rounded-[22px] outline-offset-4">
      <PostCover id={post.cover} size="thumb" />
      <div className="flex flex-1 flex-col px-1 pt-5">
        <PostMeta post={post} />
        <H className="mt-2 text-balance text-[21px] font-normal leading-snug tracking-[-0.015em] text-foreground group-hover:underline group-hover:decoration-line-strong group-hover:underline-offset-4">
          {post.title}
        </H>
        <p className="mt-2 line-clamp-2 text-[15px] leading-relaxed text-mute">{post.summary}</p>
        <div className="mt-auto pt-5">
          <AuthorLine small />
        </div>
      </div>
    </Link>
  );
}

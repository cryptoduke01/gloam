/**
 * A line diff for the SDK playground (/sdk/playground): the code an app has
 * today against the same file with Gloam added. The files are a few dozen
 * lines, so a plain longest-common-subsequence table is exact and instant.
 *
 * Within a changed block the removed lines come first, then the added ones,
 * the way a unified diff reads. Blank lines and lone closing brackets only
 * count as unchanged when real code next to them matches too, so an edit
 * reads as one block instead of being cut up around a stray "}" or gap.
 */

export type DiffKind = "same" | "add" | "del";

export interface DiffLine {
  kind: DiffKind;
  text: string;
  /** 1-based line number in the file before, or null for an added line. */
  a: number | null;
  /** 1-based line number in the file after, or null for a removed line. */
  b: number | null;
}

const split = (s: string) => s.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");

/** A line with nothing to anchor a match on: blank, or only brackets and punctuation. */
export function isTrivialLine(line: string): boolean {
  return /^[\s{}()[\];,]*$/.test(line);
}

/** A matched line is worth this much; a trivial one only breaks ties. */
const weight = (line: string) => (isTrivialLine(line) ? 1 : 1000);

/** The table over suffixes: t[i][j] = the best total weight of lines a[i:] and b[j:] share, in order. */
function lcsTable(a: string[], b: string[]): number[][] {
  const t = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const skip = Math.max(t[i + 1]![j]!, t[i]![j + 1]!);
      t[i]![j] = a[i] === b[j] ? Math.max(skip, weight(a[i]!) + t[i + 1]![j + 1]!) : skip;
    }
  }
  return t;
}

function rawDiff(a: string[], b: string[]): DiffLine[] {
  const t = lcsTable(a, b);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    const here = t[i]?.[j] ?? 0;
    const canDel = i < a.length && t[i + 1]![j]! === here;
    const canAdd = j < b.length && t[i]![j + 1]! === here;
    const equal = i < a.length && j < b.length && a[i] === b[j];
    // Real code matches as early as it can. A blank line or a lone bracket
    // matches as late as it can, so it ends up beside the code it belongs to.
    if (equal && !(isTrivialLine(a[i]!) && (canDel || canAdd))) {
      out.push({ kind: "same", text: a[i]!, a: i + 1, b: j + 1 });
      i++;
      j++;
    } else if (canDel || j >= b.length) {
      out.push({ kind: "del", text: a[i]!, a: i + 1, b: null });
      i++;
    } else {
      out.push({ kind: "add", text: b[j]!, a: null, b: j + 1 });
      j++;
    }
  }
  return regroup(out);
}

/**
 * Turns a trivial "same" line that sits between changes into a remove plus an
 * add, so a block of edits is not split by a blank line or a lone bracket that
 * happens to match. Repeats until nothing changes.
 */
function mergeTrivialAnchors(lines: DiffLine[]): DiffLine[] {
  let cur = lines;
  for (;;) {
    let changed = false;
    const next: DiffLine[] = [];
    for (let k = 0; k < cur.length; k++) {
      const l = cur[k]!;
      if (l.kind === "same" && isTrivialLine(l.text)) {
        // the nearest non-trivial neighbours on each side
        let p = k - 1;
        while (p >= 0 && cur[p]!.kind === "same" && isTrivialLine(cur[p]!.text)) p--;
        let q = k + 1;
        while (q < cur.length && cur[q]!.kind === "same" && isTrivialLine(cur[q]!.text)) q++;
        const before = p >= 0 ? cur[p]!.kind : "same";
        const after = q < cur.length ? cur[q]!.kind : "same";
        if (before !== "same" && after !== "same") {
          next.push({ kind: "del", text: l.text, a: l.a, b: null }, { kind: "add", text: l.text, a: null, b: l.b });
          changed = true;
          continue;
        }
      }
      next.push(l);
    }
    cur = changed ? regroup(next) : next;
    if (!changed) return cur;
  }
}

/** Within every run of changed lines, removes first then adds, each in file order. */
function regroup(lines: DiffLine[]): DiffLine[] {
  const out: DiffLine[] = [];
  let run: DiffLine[] = [];
  const flush = () => {
    out.push(...run.filter((l) => l.kind === "del"), ...run.filter((l) => l.kind === "add"));
    run = [];
  };
  for (const l of lines) {
    if (l.kind === "same") {
      flush();
      out.push(l);
    } else run.push(l);
  }
  flush();
  return out;
}

/** The line diff from `before` to `after`. */
export function diffLines(before: string, after: string): DiffLine[] {
  return mergeTrivialAnchors(rawDiff(split(before), split(after)));
}

/** One side of a diff back as text: what was there before, or what is there after. */
export function sideOf(lines: readonly DiffLine[], side: "before" | "after"): string {
  const drop: DiffKind = side === "before" ? "add" : "del";
  return lines
    .filter((l) => l.kind !== drop)
    .map((l) => l.text)
    .join("\n");
}

export function diffStats(lines: readonly DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const l of lines) {
    if (l.kind === "add") added++;
    else if (l.kind === "del") removed++;
  }
  return { added, removed };
}

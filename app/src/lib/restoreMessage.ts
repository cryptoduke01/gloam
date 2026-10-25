/**
 * What a backup restore did, in plain words (Settings, Restore a backup), from
 * lib/shield importNotesBackup's counts. Pure, so
 * scripts/selftest-restore-message.mts can hold it.
 */

export type RestoreCounts = {
  /** Balances added to this browser. */
  count: number;
  /** Already in this browser before the restore. */
  kept: number;
  /** Spent after the backup was made: kept as history. */
  moved: number;
  /** Of those, claimed payments secured after the backup was made. */
  movedClaims: number;
  /** Not in the vault yet: kept out of the balance until they are. */
  unseen: number;
  /** Not balances this app could have made: left out. */
  skipped: number;
};

export function restoreMessage(r: RestoreCounts): string {
  const parts: string[] = [];
  if (r.count || (!r.kept && !r.moved && !r.unseen && !r.skipped)) {
    parts.push(`Restored ${r.count} balance(s). Open Portfolio or Vault to see them.`);
  } else if (r.kept && !r.moved && !r.unseen && !r.skipped) {
    parts.push("Everything in this backup is already in this browser, so nothing changed.");
  } else if (!r.moved) {
    // Something was held back (not in the vault yet, or not a balance), so
    // "already here" would not be true of all of it.
    parts.push("Nothing was added to your balance.");
  }
  if (r.moved) {
    parts.push(
      r.moved === 1
        ? "One balance in this backup was spent after the backup was made, so it stays out of your balance."
        : `${r.moved} balances in this backup were spent after the backup was made, so they stay out of your balance.`
    );
  }
  if (r.movedClaims) {
    parts.push(
      "A claimed payment you secured since then is in the browser where you secured it, and in any backup made after that."
    );
  }
  if (r.unseen) {
    parts.push(
      r.unseen === 1
        ? "One balance in this backup is not in the vault, so it stays out of your balance until it is."
        : `${r.unseen} balances in this backup are not in the vault, so they stay out of your balance until they are.`
    );
  }
  if (r.skipped) {
    parts.push(
      r.skipped === 1
        ? "One entry in this backup is not a Gloam balance, so it was left out."
        : `${r.skipped} entries in this backup are not Gloam balances, so they were left out.`
    );
  }
  if (r.kept && !r.count && (r.unseen || r.skipped || r.moved)) {
    parts.push("The rest is already in this browser.");
  }
  return parts.join(" ");
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  confirmedNotes,
  loadLocalNotes,
  sumNoteWei,
  type LocalNote,
} from "@/lib/shield";

/** Browser-local shielded notes for the connected address. */
export function useLocalShieldNotes(address?: string | null) {
  const [notes, setNotes] = useState<LocalNote[]>([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => {
    setNotes(loadLocalNotes(address));
    setReady(true);
  }, [address]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Other tabs / same-session updates
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "gloam.shield.notes.v1") refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  const open = useMemo(() => confirmedNotes(notes), [notes]);
  const shieldedWei = useMemo(() => sumNoteWei(notes), [notes]);

  return { notes, open, shieldedWei, ready, refresh };
}

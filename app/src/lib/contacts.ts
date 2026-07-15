/**
 * Local address book for Gloam receive tags (private pay contacts).
 */

const KEY = "gloam.contacts.v1";

export type GloamContact = {
  id: string;
  label: string;
  tag: string;
  createdAt: number;
};

export function loadContacts(): GloamContact[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const all = JSON.parse(raw) as GloamContact[];
    return Array.isArray(all) ? all : [];
  } catch {
    return [];
  }
}

export function saveContacts(list: GloamContact[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 50)));
}

export function upsertContact(label: string, tag: string): GloamContact {
  const t = tag.trim();
  const list = loadContacts().filter(
    (c) => c.tag.toLowerCase() !== t.toLowerCase()
  );
  const row: GloamContact = {
    id: `c-${Date.now()}`,
    label: label.trim() || "Contact",
    tag: t,
    createdAt: Date.now(),
  };
  saveContacts([row, ...list]);
  return row;
}

export function removeContact(id: string) {
  saveContacts(loadContacts().filter((c) => c.id !== id));
}

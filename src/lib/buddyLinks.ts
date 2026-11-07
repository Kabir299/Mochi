import type { BuddySnapshot } from '@/lib/buddies';

export type ShareScope = 'all' | 'some';
export type ShareChoice = { scope: ShareScope; habitIds: number[] };

// A friendship as this phone sees it, saved in settings as JSON.
export type BuddyLink = ShareChoice & {
  id: string;
  // Encrypts progress on this link. Both phones get it from the invite; the server never does.
  key: string;
  role: 'inviter' | 'joiner';
  joined: boolean;
  // The invite, kept so it can be sent again until someone joins.
  code: string | null;
  buddy: BuddySnapshot | null;
  // When the buddy's update reached the server.
  receivedAt: string | null;
  // The last update sent, so nothing goes out unless it changed.
  sent: string | null;
  // Removed here, but the server hasn't confirmed yet (the phone may be offline).
  removing: boolean;
};

export type PulledLink = {
  link_id: string;
  joined: boolean;
  updated_at: string | null;
  // Already decrypted and checked; null when there is nothing new.
  opened: BuddySnapshot | null;
};

const INVITE = /MOCHI2-([A-Za-z0-9_-]{43})(?![A-Za-z0-9_-])/;

export const inviteCode = (token: string) => `MOCHI2-${token}`;

// Accepts the whole shared message, not just the code.
export function parseInviteToken(text: string) {
  return INVITE.exec(text)?.[1] ?? null;
}

export function parseLinks(raw: string): BuddyLink[] {
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list)
      ? list.filter((l) => typeof l?.id === 'string' && typeof l?.key === 'string')
      : [];
  } catch {
    return [];
  }
}

// Applies what the server said. It lists every link this phone is on, so one that's missing was
// removed by the friend, or was an invite that ran out. Only call this with a real answer: a
// failed request must leave everything alone, so friends don't vanish when the phone is offline.
export function reconcile(links: BuddyLink[], pulled: PulledLink[]): BuddyLink[] {
  const byId = new Map(pulled.map((p) => [p.link_id, p]));
  return links.flatMap((link) => {
    if (link.removing) return [link];
    const row = byId.get(link.id);
    if (!row) return [];
    return [
      {
        ...link,
        joined: row.joined,
        code: row.joined ? null : link.code,
        buddy: row.opened ?? link.buddy,
        receivedAt: row.opened ? row.updated_at : link.receivedAt,
      },
    ];
  });
}

export function sharedHabits<T extends { id: number }>(habits: T[], choice: ShareChoice) {
  return choice.scope === 'all' ? habits : habits.filter((h) => choice.habitIds.includes(h.id));
}

export function timeAgo(iso: string | null, now: number) {
  if (!iso) return 'not yet';
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(minutes)) return 'not yet';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

import type { Reaction } from "./types.ts";

export function toggledReactions(reactions: readonly Reaction[], key: string): readonly Reaction[] {
  const next: Reaction[] = [];
  let found = false;
  for (const reaction of reactions) {
    if (reaction.key !== key) {
      next.push(reaction);
      continue;
    }
    found = true;
    if (reaction.mine) {
      if (reaction.count > 1) next.push({ ...reaction, count: reaction.count - 1, mine: false });
    } else {
      next.push({ ...reaction, count: reaction.count + 1, mine: true });
    }
  }
  if (!found) next.push({ key, count: 1, mine: true });
  return next;
}

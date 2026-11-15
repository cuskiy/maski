export function markMultilineBubbles(root: HTMLElement): void {
  const bubbles = Array.from(root.querySelectorAll<HTMLElement>(".bubble"));
  for (const bubble of bubbles) bubble.classList.remove("is-multiline");
  const multiline = bubbles.map((bubble) => {
    const text = bubble.querySelector<HTMLElement>(".message-text");
    return text !== null && text.getClientRects().length > 1;
  });
  for (const [index, bubble] of bubbles.entries()) {
    if (multiline[index] === true) bubble.classList.add("is-multiline");
  }
}

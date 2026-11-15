import type { Composer } from "./regions/composer.ts";

const LONG_PRESS_MS = 500;

function avatarTarget(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(".message-avatar") : null;
}

function mentionFromAvatar(composer: Composer, avatar: HTMLElement): void {
  const userId = avatar.dataset["profileId"] ?? "";
  const name = avatar.dataset["profile"] ?? "";
  const image = avatar.querySelector("img");
  composer.insertMention(name, userId, image?.getAttribute("src") ?? null);
}

function isInteractive(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest("a, button, input, textarea, summary, [contenteditable], .mention") !== null
  );
}

export function wireComposerInteractions(composer: Composer): () => void {
  let timer = 0;
  let suppressClickTarget: HTMLElement | null = null;
  let pressX = 0;
  let pressY = 0;

  const cancelPress = (): void => {
    if (timer !== 0) window.clearTimeout(timer);
    timer = 0;
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === "mouse") return;
    const avatar = avatarTarget(event.target);
    if (avatar === null) return;
    event.stopPropagation();
    pressX = event.clientX;
    pressY = event.clientY;
    cancelPress();
    timer = window.setTimeout(() => {
      timer = 0;
      suppressClickTarget = avatar;
      mentionFromAvatar(composer, avatar);
    }, LONG_PRESS_MS);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (timer === 0) return;
    if (Math.abs(event.clientX - pressX) > 8 || Math.abs(event.clientY - pressY) > 8) cancelPress();
  };

  const onPointerEnd = (): void => cancelPress();

  const onContextMenu = (event: MouseEvent): void => {
    const avatar = avatarTarget(event.target);
    if (avatar === null) return;
    cancelPress();
    event.preventDefault();
    event.stopPropagation();
    if (suppressClickTarget === avatar) return;
    mentionFromAvatar(composer, avatar);
  };

  const onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (suppressClickTarget !== null) {
      if (target instanceof Node && suppressClickTarget.contains(target)) {
        suppressClickTarget = null;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      suppressClickTarget = null;
    }
    if (isInteractive(target)) return;
    if (!(target instanceof Element) || target.closest(".message") === null) return;
    if (target.closest(".timeline-region")?.classList.contains("is-selecting") === true) return;
    const selection = document.getSelection();
    if (selection !== null && !selection.isCollapsed) return;
    composer.focus();
  };

  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("pointermove", onPointerMove, true);
  document.addEventListener("pointerup", onPointerEnd, true);
  document.addEventListener("pointercancel", onPointerEnd, true);
  document.addEventListener("contextmenu", onContextMenu, true);
  document.addEventListener("click", onClick, true);

  return () => {
    cancelPress();
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("pointermove", onPointerMove, true);
    document.removeEventListener("pointerup", onPointerEnd, true);
    document.removeEventListener("pointercancel", onPointerEnd, true);
    document.removeEventListener("contextmenu", onContextMenu, true);
    document.removeEventListener("click", onClick, true);
  };
}

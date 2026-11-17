/**
 * The chat effects a message can ask for. Each one is a short burst of particles over the conversation,
 * drawn with transforms only so it never blocks the reader, and skipped when motion is reduced.
 */
import type { ChatEffect } from "../core/types.ts";

const PARTICLES: Readonly<Record<ChatEffect, number>> = {
  confetti: 60,
  fireworks: 48,
  rainfall: 70,
  snowfall: 46,
  "space-invaders": 20,
  hearts: 28,
};

const LIFETIME_MS = 4000;

export function playEffect(effect: ChatEffect, container: HTMLElement): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const layer = document.createElement("div");
  layer.className = `effect-layer is-${effect}`;
  layer.setAttribute("aria-hidden", "true");
  const count = PARTICLES[effect];
  for (let index = 0; index < count; index += 1) {
    const particle = document.createElement("span");
    particle.className = "effect-particle";
    particle.style.setProperty("--x", `${String(Math.round(Math.random() * 100))}%`);
    particle.style.setProperty("--delay", `${String(Math.round(Math.random() * 700))}ms`);
    particle.style.setProperty("--drift", `${String(Math.round(Math.random() * 160) - 80)}px`);
    particle.style.setProperty("--spin", `${String(Math.round(Math.random() * 720) - 360)}deg`);
    particle.style.setProperty("--size", `${String(4 + Math.round(Math.random() * 6))}px`);
    layer.append(particle);
  }
  container.append(layer);
  window.setTimeout(() => layer.remove(), LIFETIME_MS);
}

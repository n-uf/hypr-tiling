/**
 * A host claim (`onExternalDrop`) takes the dragged pane off this tree on
 * release. Rather than popping out of existence, the pane fades where it was
 * drawn: a static copy of the lifted layer (a picture; the pane itself leaves
 * with the claim) is left in its place and faded out, then removed.
 *
 * @internal
 */

/** How long the claimed pane takes to fade out. */
export const CLAIM_FADE_DURATION_MS: number = 160;

/** Attribute on the faded copy (tests and hit-test exclusions read it). */
export const CLAIM_FADE_ATTR: string = "data-hpt-claim-fade";

/** Attributes a copy must not carry, so nothing mistakes it for a live pane. */
const LIVE_PANE_ATTRIBUTES: ReadonlyArray<string> = [
  "data-hpt-lifted",
  "data-hpt-leaf",
  "data-hpt-leaf-raised",
  "data-leaf-id",
  "id",
];

/**
 * Leave a fading copy of `layer` in its place. Without the Web Animations API
 * (jsdom) or under reduced motion, nothing is left behind.
 */
export function fadeOutClaimedLayer(
  layer: HTMLElement | null,
  reducedMotion: boolean,
): void {
  if (
    layer == null ||
    reducedMotion ||
    layer.parentElement == null ||
    typeof layer.animate !== "function"
  ) {
    return;
  }
  const copy: HTMLElement = layer.cloneNode(true) as HTMLElement;
  for (const name of LIVE_PANE_ATTRIBUTES) {
    copy.removeAttribute(name);
    for (const element of Array.from(copy.querySelectorAll(`[${name}]`))) {
      element.removeAttribute(name);
    }
  }
  copy.setAttribute(CLAIM_FADE_ATTR, "");
  copy.setAttribute("aria-hidden", "true");
  copy.setAttribute("inert", "");
  layer.parentElement.appendChild(copy);
  const animation: Animation = copy.animate(
    [{ opacity: 1 }, { opacity: 0 }],
    { duration: CLAIM_FADE_DURATION_MS, easing: "ease-out", fill: "forwards" },
  );
  const remove = (): void => {
    copy.remove();
  };
  animation.addEventListener("finish", remove);
  animation.addEventListener("cancel", remove);
}

/**
 * Keyboard combination matching for application shortcuts.
 *
 * Combinations are written as `mod+k`, `shift+/`, `g`. The `mod` modifier means
 * Command on Apple platforms and Control elsewhere, so a shortcut is declared
 * once and behaves natively on both.
 */

interface ParsedCombo {
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
}

function parseCombo(combo: string): ParsedCombo {
  const parts = combo.toLowerCase().split("+");

  return {
    key: parts[parts.length - 1],
    mod: parts.includes("mod"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt"),
  };
}

/** Whether a keyboard event matches a combination. */
export function matchesCombo(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">,
  combo: string,
): boolean {
  const parsed = parseCombo(combo);

  // Either physical modifier satisfies `mod`. Checking the platform instead
  // would misfire for anyone using an Apple keyboard on another operating
  // system, or a browser that reports the platform inconsistently.
  const modPressed = event.metaKey || event.ctrlKey;

  if (parsed.mod !== modPressed) return false;
  if (parsed.shift !== event.shiftKey) return false;
  if (parsed.alt !== event.altKey) return false;

  return event.key.toLowerCase() === parsed.key;
}

/**
 * Whether an event target is somewhere the user is entering text.
 *
 * Single-key shortcuts must not fire while typing — a shortcut bound to `g`
 * would otherwise make it impossible to write the letter into a note or a
 * search field.
 */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  if (target.isContentEditable) return true;

  const tag = target.tagName;

  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

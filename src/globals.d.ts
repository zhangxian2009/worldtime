// Ambient declarations for libraries loaded via <script> tags in lib/.
// These are NOT bundled — they live on window globally.
// Declared as `any` because we don't need full d3/topojson type fidelity here;
// the goal is just to silence ts-check for these names.

declare const d3: any;
declare const topojson: any;

// Custom global we expose for cross-tab debugging
interface Window {
  ALL_CITIES?: import('./main').City[];
}

// Allow ad-hoc property tagging on DOM elements (e.g. _secondToggleAdded flag)
interface HTMLElement {
  [key: string]: any;
}

// Pragmatic relaxations:
// querySelectorAll returns Element (no dataset/disabled/style), but in this
// project we always select buttons/divs via class selectors, so allow these.
// A future stricter pass can replace these with explicit casts.
interface Element {
  dataset?: DOMStringMap;
  disabled?: boolean;
  style?: CSSStyleDeclaration;
}

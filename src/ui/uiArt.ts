/** Painted decorations for the interface itself (not the board). Keys double as file names under public/art. */
export const UI_ART = {
  tradingPost: 'ui-trading-post',
} as const;

export const UI_ART_KEYS: string[] = Object.values(UI_ART);

export function uiArtPath(key: string): string {
  return `/art/${key}.png`;
}

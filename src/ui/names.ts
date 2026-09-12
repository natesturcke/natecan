/** Playful bot names per colour, chosen per game from the seed. */
const NAMES: Record<'blue' | 'orange' | 'white', string[]> = {
  blue: [
    'Blue Devil',
    'Blue Baron',
    'Bluebeard',
    'Blue Lagoon Larry',
    'Blueberry Bill',
    'Blue Moon Mona',
    'Admiral Azure',
    'Cobalt Kate',
    'Navy Ned',
    'Sapphire Sam',
    'Blue Streak',
    'Indigo Ivy',
    'Blue Thunder',
    'Captain Cerulean',
  ],
  orange: [
    'Orange Crush',
    'Agent Orange',
    'Tangerine Tina',
    'Marmalade Max',
    'Pumpkin Pete',
    'Amber Alert Annie',
    'Orange Ranger',
    'Clementine Clive',
    'Apricot Al',
    'Saffron Sally',
    'Rusty Ron',
    'Carrot Top Carl',
    'Sunset Sid',
    'Citrus Cindy',
  ],
  white: [
    'White Walker',
    'Snow Queen',
    'Ivory Ike',
    'Pearl Pauline',
    'Ghost Gary',
    'Frosty Fred',
    'Marshmallow Mike',
    'Vanilla Vince',
    'Sir Whiteout',
    'Chalky Chuck',
    'Lily White',
    'Alabaster Abe',
    'Polar Pat',
    'Milky Mel',
  ],
};

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Returns one name per colour for a game seed, never repeating within the game. */
export function botNamesFor(seed: number): { blue: string; orange: string; white: string } {
  const rnd = mulberry(seed * 7919 + 13);
  const pick = (list: string[]) => list[Math.floor(rnd() * list.length)];
  return { blue: pick(NAMES.blue), orange: pick(NAMES.orange), white: pick(NAMES.white) };
}

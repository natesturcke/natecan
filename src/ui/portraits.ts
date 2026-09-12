/**
 * Character portraits: one painted "play card" per bot name, plus a handful for the human player.
 * The art pipeline (scripts/art-manifest.ts) reads PORTRAITS to know what to paint; the UI reads
 * portraitKey / humanPortraitKey to know what to show, and falls back to a monogram when a PNG is missing.
 */
import { NAMES } from './names';

export interface PortraitSpec {
  key: string;
  /** Name lettered on the card. */
  title: string;
  /** Who they are, for the painter. */
  hint: string;
  /** Team colour name used for clothing and accents. */
  team: 'blue' | 'orange' | 'white' | 'red';
}

export function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function portraitKey(name: string): string {
  return `portrait-${slug(name)}`;
}

export const HUMAN_PORTRAIT_COUNT = 6;

/** The human's card varies with the game seed so every game feels a little different. */
export function humanPortraitKey(seed: number): string {
  return `portrait-you-${(Math.abs(seed) % HUMAN_PORTRAIT_COUNT) + 1}`;
}

export function portraitPath(key: string): string {
  return `/art/${key}.png`;
}

const BOT_HINTS: Record<string, string> = {
  // blue
  'Blue Devil': 'a grinning rogue with a little pair of horns on his cap, a forked goatee and mischievous eyes',
  'Blue Baron': 'a portly aristocrat in a velvet coat with a monocle, waxed moustache and a chain of office',
  Bluebeard: 'a burly sea captain with a huge braided blue-dyed beard, tricorn hat and a gold earring',
  'Blue Lagoon Larry': 'a sun-tanned beachcomber in a straw hat with a shell necklace and a lazy smile',
  'Blueberry Bill': 'a round cheerful farmer with berry-stained fingers, a basket of blueberries and a straw hat',
  'Blue Moon Mona': 'a dreamy fortune teller with a crescent-moon headpiece and silver-blue shawl',
  'Admiral Azure': 'a stern naval admiral with epaulettes, a bicorne hat and a spyglass',
  'Cobalt Kate': 'a sharp-eyed blacksmith woman with goggles pushed up and a leather apron',
  'Navy Ned': 'a wiry old sailor with a striped shirt, pipe and a tattoo of an anchor',
  'Sapphire Sam': 'a smooth jeweller in a fine waistcoat holding a large cut sapphire up to the light',
  'Blue Streak': 'a lean courier runner with windswept hair, a satchel and a lightning-bolt pin',
  'Indigo Ivy': 'a botanist with a wide-brimmed hat wreathed in indigo flowers and vines',
  'Blue Thunder': 'a hulking bearded warrior with a hammer and a storm-cloud tattoo',
  'Captain Cerulean': 'a dashing airship captain with flying goggles and a long sky-blue scarf',
  // orange
  'Orange Crush': 'a beefy wrestler in an orange mask flexing with a huge grin',
  'Agent Orange': 'a suave secret agent in a tangerine suit and dark glasses',
  'Tangerine Tina': 'a bright market seller with a headscarf and an armful of tangerines',
  'Marmalade Max': 'a jolly baker with flour on his apron holding a jar of marmalade',
  'Pumpkin Pete': 'a lanky scarecrow-like farmer cradling an enormous pumpkin',
  'Amber Alert Annie': 'a keen town crier with a bell, a tricorn hat and an amber pendant',
  'Orange Ranger': 'a forest ranger with a wide hat, a bow and an orange bandana',
  'Clementine Clive': 'a dapper gentleman with a clementine in his buttonhole and a neat bowler hat',
  'Apricot Al': 'a gentle orchard keeper with a ladder over one shoulder and a basket of apricots',
  'Saffron Sally': 'a spice merchant with gold bangles and a saffron-coloured veil',
  'Rusty Ron': 'a grizzled tinker with a rusty helmet and a bag of tools',
  'Carrot Top Carl': 'a freckled lad with a shock of bright orange hair and a carrot behind his ear',
  'Sunset Sid': 'a laid-back troubadour with a lute, silhouetted against a warm sunset glow',
  'Citrus Cindy': 'a sprightly lemonade seller with a lemon-slice hat and a pitcher',
  // white
  'White Walker': 'a hooded frost-rimmed wanderer with pale eyes and icicles on his cloak',
  'Snow Queen': 'a regal queen in a white fur mantle with a crown of ice crystals',
  'Ivory Ike': 'a stately old scholar with ivory-white hair and a long quill',
  'Pearl Pauline': 'an elegant pearl diver with a string of pearls and sea-damp hair',
  'Ghost Gary': 'a translucent friendly ghost in a nightcap holding a candle',
  'Frosty Fred': 'a rosy-cheeked snowman-ish fellow in a top hat and scarf with a carrot nose',
  'Marshmallow Mike': 'a soft round puffy chef with a marshmallow on a stick',
  'Vanilla Vince': 'a mild ice-cream vendor in a white paper hat with a vanilla cone',
  'Sir Whiteout': 'a knight in gleaming white plate armour with a plume of snow',
  'Chalky Chuck': 'a dusty schoolmaster with chalk-white fingers holding a slate',
  'Lily White': 'a serene florist holding a bunch of white lilies',
  'Alabaster Abe': 'a stone sculptor covered in white marble dust with a chisel',
  'Polar Pat': 'a bundled-up arctic explorer with snow goggles and a husky pup',
  'Milky Mel': 'a cheerful dairy maid with a milk pail and a white bonnet',
};

const HUMAN_HINTS = [
  'a confident young settler with a red cloak, a map tube and a determined smile',
  'a weathered explorer woman with a red headscarf, compass and freckles',
  'a red-bearded shipwright with rolled sleeves and a carpenter square',
  'a clever merchant with a red feathered cap and a ledger under one arm',
  'a farm girl with red ribbons, a hoe over her shoulder and a sunny grin',
  'a dashing red-coated cartographer with ink-stained fingers and spectacles',
];

/** Every portrait the art pipeline should paint. */
export const PORTRAITS: PortraitSpec[] = [
  ...(['blue', 'orange', 'white'] as const).flatMap((team) =>
    NAMES[team].map<PortraitSpec>((name) => ({ key: portraitKey(name), title: name, hint: BOT_HINTS[name] ?? 'a colourful island settler', team })),
  ),
  ...HUMAN_HINTS.map<PortraitSpec>((hint, i) => ({ key: `portrait-you-${i + 1}`, title: 'Settler', hint, team: 'red' })),
];

export const PORTRAIT_KEYS: string[] = PORTRAITS.map((p) => p.key);

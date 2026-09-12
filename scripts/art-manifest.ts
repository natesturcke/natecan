/**
 * One entry per asset key from src/board-phaser/assets.ts. Consumed by
 * scripts/generate-art.ts. Keys and output sizes are the renderer's contract;
 * everything else here (prompts, models, API sizes) is free to tweak.
 */
import {
  CARD_IMAGE,
  CARD_KEYS,
  DEV_CARD_KEYS,
  HARBOR_IMAGE,
  HARBOR_KEYS,
  MISC_KEYS,
  PIECE_IMAGE,
  PIECE_KEYS,
  ROAD_IMAGE,
  ROAD_KEYS,
  TILE_IMAGE,
  TILE_KEYS,
  TOKEN_IMAGE,
  tileVariantKey,
  tokenKey,
  type RoadOrientation,
} from '../src/board-phaser/assets';
import { PORTRAITS, type PortraitSpec } from '../src/ui/portraits';

export type Quality = 'low' | 'medium' | 'high' | 'xhigh';

export type Template =
  | { type: 'tile' }
  | { type: 'road'; orientation: RoadOrientation }
  | { type: 'piece' };

/** How a trimmed sprite (piece / harbor) is fitted onto its final canvas. */
export interface Fit {
  /** Max width/height of the trimmed artwork after scaling, in asset pixels. */
  maxWidth: number;
  maxHeight: number;
  /** Where the bottom of the trimmed artwork lands (asset pixels). */
  bottomY: number;
  /** Horizontal centre of the artwork (asset pixels). */
  centerX: number;
}

export interface ArtEntry {
  key: string;
  kind: 'edit' | 'generate' | 'code';
  prompt: string;
  /** Final asset size (what the renderer loads). */
  width: number;
  height: number;
  /** Size requested from the API, e.g. '1024x896'. Must be multiples of 16. */
  apiSize: string;
  quality: Quality;
  /** Base image for `edit` calls. */
  template?: Template;
  /** Mask for `edit` calls (only tiles and roads use one). */
  mask?: boolean;
  /** Keys of previously generated assets to pass as extra style-reference images (edit only). */
  references?: string[];
  /** Post-processing recipe. */
  post: 'tile' | 'road' | 'sprite' | 'seamless' | 'card' | 'token';
  fit?: Fit;
  transparent: boolean;
  /** Optional data for code-drawn assets. */
  token?: number;
}

const STYLE =
  'Painted, realistic, tabletop miniature board-game style, like a hand-painted resin diorama photographed under soft studio light. ' +
  'Isometric oblique view from the south (camera looking north and slightly down, ground plane foreshortened vertically to 60%). ' +
  'Light comes from the top-left, casting soft shadows to the lower right. Rich but natural colours, crisp detail, no text, no watermark, no border.';

const TILE_COMMON =
  'The first image is a blank hexagonal terrain tile seen from the fixed oblique camera: a flat hexagon top face with rock side faces below it. ' +
  'Repaint ONLY the flat grey top face as the terrain described below. The terrain must fill the entire hexagon top face right up to its six edges and then stop exactly at the edges. ' +
  'The terrain surface stays flat on the hexagon; any relief (trees, hills, rocks, buildings) is small, rises at most a little above the hexagon outline, and never hangs over the edges. ' +
  'Keep the north (upper) third of the hexagon relatively flat and uncluttered so a round number token can be placed there. ' +
  'Do not alter the rock side faces below the hexagon and do not paint anything outside the tile; the background must remain fully transparent. ' +
  'GEOMETRY LOCK: keep the tile outline exactly as in the input image: same size, same position touching the left and right image edges, the same hexagon proportions (the top face is a regular hexagon foreshortened to 60% height), perfectly vertical side faces of the same height; do not shrink the tile, do not add a margin, do not change the camera angle. ' +
  STYLE;

const STYLE_REF = ' Match the painting style, palette, lighting and level of detail of the forest tile shown in the last input image.';

const TILE_PROMPTS: Record<keyof typeof TILE_KEYS, string> = {
  forest:
    'Terrain: dense temperate forest. Many small pine and oak trees packed together, deep and mid greens with a few autumn yellow accents, a mossy forest floor and a couple of fallen logs visible between trunks. Trees are short (chunky miniature scale) so the hexagon stays readable.',
  hills:
    'Terrain: red-brown clay hills. Rolling terracotta and rust-coloured clay banks with exposed layered earth, sparse dry grass, a small stone brick kiln with a thin wisp of smoke and a stack of fired bricks beside it.',
  mountains:
    'Terrain: grey rocky mountains. Jagged granite peaks and ridges with snow on the summits, scree slopes, a dark cave mouth at the base and a hint of an ore vein glinting in the rock. Peaks are compact so they rise only slightly above the hexagon.',
  fields:
    'Terrain: golden wheat fields. Neat rows of ripe golden wheat running across the tile, a dirt track between the rows, a few hay bales and a small wooden fence, warm harvest colours.',
  pasture:
    'Terrain: green sheep pasture. Lush rolling green meadow with short grass, a few white fluffy sheep grazing, a little wooden fence segment and a couple of wildflower patches.',
  desert:
    'Terrain: sandy desert. Pale golden sand dunes with wind ripples, a bleached dead tree, a few scattered rocks and a bleached animal skull, no water.',
};

const PIECE_COMMON =
  'Paint a single isolated object on the transparent canvas, centred, filling about 70% of the canvas width, standing on the ground plane with a soft contact shadow under it. ' +
  'No ground tile, no base, no scenery, nothing else in the image; fully transparent background. ' +
  STYLE;

const NEUTRAL =
  ' IMPORTANT COLOURS: the entire object must be painted in neutral light grey and off-white tones only, like an unpainted light grey resin miniature, so it can be tinted later; all shading in greyscale, the roof a slightly darker grey than the walls. No coloured pixels at all.';

const HARBOR_COMMON =
  'Paint a single small wooden harbor: a weathered wooden pier / dock on stilts with a mooring post and a small single-masted sailing ship moored next to it. ' +
  'The sprite will be placed on top of a separate sea texture, so paint NO water at all: no water patch, no waves, no reflections; the dock stilts and the ship hull simply end at the transparent ground plane, with only a faint soft contact shadow. ' +
  'A small wooden signpost on the dock carries a painted plank sign that reads exactly "{RATE}" in large bold dark letters, facing the viewer. ' +
  'The object is centred and fills about 75% of the canvas width. Fully transparent background. ' +
  STYLE;

const CARD_COMMON =
  'A playing card illustration, full-bleed portrait format, no card border needed. Painted, realistic style matching a tabletop board game with warm, slightly aged palette. ' +
  'At the bottom is a small parchment banner with the bold title text "{TITLE}" and nothing else written.';

/**
 * Composition variants (keys hex-<terrain>-2 / -3). The renderer uses them when
 * the files exist so neighbouring tiles of the same terrain do not look cloned.
 */
const TILE_VARIANTS: Record<keyof typeof TILE_KEYS, [string, string]> = {
  forest: [
    'Terrain: dense temperate forest with a small sunlit clearing and a tiny round pond in the lower half; tree clumps arranged differently from the reference, a narrow dirt footpath winding between them, a few autumn-yellow trees on the left.',
    'Terrain: dense temperate forest crossed by a small mossy stream with a fallen log bridging it; mostly dark pines with one clump of broad oaks on the right, a woodcutter\'s stump and log pile in a gap.',
  ],
  mountains: [
    'Terrain: grey rocky mountains with a different ridge layout: one tall snow-capped peak on the left, a lower ridge on the right, a small timber-framed mine entrance with a cart track and a mine cart at its base, scree slopes.',
    'Terrain: grey rocky mountains with a snowy saddle between two peaks and a small white waterfall dropping into a little rock pool in the lower right, scattered boulders, a few hardy pines.',
  ],
  fields: [
    'Terrain: golden wheat fields with the wheat rows running the other diagonal direction, a small squat stone windmill with short wooden sails standing near the centre of the tile (well inside the hexagon, never touching its edges), a dirt track leading to it, a few haystacks.',
    'Terrain: golden wheat fields, partly harvested: rows of cut stubble in the foreground with round haystacks and a wooden hay cart, standing wheat behind, a low stone wall along one edge with a gate.',
  ],
  pasture: [
    'Terrain: green sheep pasture with a small wooden barn with a shingled roof near the lower left, a hedge along one edge, a flock of sheep clustered on the right, a stone water trough.',
    'Terrain: green sheep pasture on a gently rolling meadow with a small hedged sheepfold in the middle holding a few sheep, a lone oak tree, a winding footpath and daisies.',
  ],
  hills: [
    'Terrain: red-brown clay hills with an open clay quarry: a stepped pit of layered terracotta earth with wooden ladders and a cart of clay, sparse dry grass on the banks, no kiln.',
    'Terrain: red-brown clay hills with flooded clay pits: a few shallow rust-red pools between the clay banks, a small drying rack of raw bricks, a lone gnarled tree, a dirt path.',
  ],
  desert: [
    'Terrain: sandy desert with a small oasis in the lower half: a tiny pool of water fringed by two or three date palms and a patch of green reeds, dunes with wind ripples elsewhere.',
    'Terrain: sandy desert with tall sweeping dunes, a half-buried bleached ribcage and skull, a couple of dark rocks and a lone dry shrub; no water, no trees.',
  ],
};

function tileEntry(terrain: keyof typeof TILE_KEYS, variant: 1 | 2 | 3 = 1): ArtEntry {
  const baseKey = TILE_KEYS[terrain];
  const key = tileVariantKey(terrain, variant);
  const isForest = terrain === 'forest' && variant === 1;
  const terrainPrompt = variant === 1 ? TILE_PROMPTS[terrain] : TILE_VARIANTS[terrain][variant - 2];
  const variantNote =
    variant === 1
      ? ''
      : ' This is a composition variant: keep exactly the same palette, lighting, painting style and scale as the reference tile in the last input image, but arrange the scene differently as described.';
  return {
    key,
    kind: 'edit',
    prompt: TILE_COMMON + ' ' + terrainPrompt + (isForest ? '' : STYLE_REF) + variantNote,
    width: TILE_IMAGE.width,
    height: TILE_IMAGE.height,
    apiSize: `${TILE_IMAGE.width * 2}x${TILE_IMAGE.height * 2}`,
    quality: 'high',
    template: { type: 'tile' },
    mask: true,
    // Variants reference their own terrain's first tile so palette and lighting match exactly.
    references: isForest ? [] : [variant === 1 ? TILE_KEYS.forest : baseKey],
    post: 'tile',
    transparent: true,
  };
}

/** Per-player building styles: full colour, keys settlement-1..4 / city-1..4. */
export interface PlayerStyle {
  colourName: string;
  hex: string;
  architecture: string;
}
export const PLAYER_STYLES: PlayerStyle[] = [
  {
    colourName: 'red',
    hex: '#d33b2f',
    architecture:
      'half-timbered Germanic architecture: cream plaster walls with dark exposed timber framing, steep pitched roofs of red clay tiles, small dormer windows',
  },
  {
    colourName: 'blue',
    hex: '#3b6fd6',
    architecture:
      'stone Norman coastal architecture: grey fieldstone walls, blue slate roofs, a small round lighthouse-like tower with a lantern room, nets and barrels',
  },
  {
    colourName: 'orange',
    hex: '#e8862e',
    architecture:
      'Mediterranean adobe architecture: warm terracotta and ochre plaster walls, rounded arches and arcades, flat and low-pitched terracotta-tile roofs, a small bell tower, potted plants',
  },
  {
    colourName: 'white/cream',
    hex: '#f2efe4',
    architecture:
      'whitewashed Nordic Alpine architecture: bright white lime-washed walls with dark stained timber balconies and trim, a turf-roofed log barn, wooden shingle roofs, a stone chimney',
  },
];

export function playerPieceKey(kind: 'settlement' | 'city', player: 1 | 2 | 3 | 4): string {
  return `${kind}-${player}`;
}

export const PLAYER_PIECE_KEYS: string[] = ([1, 2, 3, 4] as const).flatMap((p) => [playerPieceKey('settlement', p), playerPieceKey('city', p)]);

function playerPieceEntry(kind: 'settlement' | 'city', player: 1 | 2 | 3 | 4): ArtEntry {
  const st = PLAYER_STYLES[player - 1];
  const colour = `${st.colourName} (${st.hex})`;
  const scene =
    kind === 'settlement'
      ? 'Object: a small village bustling with life on a roughly elliptical patch of ground: a cluster of three or four small buildings around a tiny square with a stone well and a market stall with an awning, ' +
        'tiny villagers walking about, a little wooden pen with a couple of sheep and a cow, a hay cart, thin chimney smoke. Buildings stay low (one storey) so it is clearly humbler than a walled city.'
      : 'Object: a walled town bustling with life on a roughly elliptical patch of ground: a crenellated stone wall with a gatehouse and open gate in front, inside it a tight dense cluster of taller two-storey buildings, ' +
        'a tall keep or church tower rising in the middle, several banners and flags on the towers, tiny townsfolk in the gate and on the wall walk, a cart at the gate. Clearly grander and taller than a village.';
  return {
    key: playerPieceKey(kind, player),
    kind: 'edit',
    prompt:
      PIECE_COMMON +
      ' ' +
      scene +
      ` Architecture: ${st.architecture}. PLAYER COLOUR: the player's colour is ${colour}; bake it prominently into the roofs, banners, flags and awnings so the owner is recognisable at a glance from a distance` +
      (player === 4 ? ', using the white/cream on walls and roofs with dark timber for contrast.' : '.') +
      ' Full colour, painted realistic miniature style. The last input image is a neutral grey version of this kind of piece: follow its camera angle, scale, footprint and overall composition, but repaint it in full colour in the architecture described.' +
      ' Match the palette richness, lighting and level of detail of the forest tile in the second input image.',
    width: PIECE_IMAGE.width,
    height: PIECE_IMAGE.height,
    apiSize: `${PIECE_IMAGE.width * 4}x${PIECE_IMAGE.height * 4}`,
    quality: 'medium',
    template: { type: 'piece' },
    references: [TILE_KEYS.forest, kind === 'settlement' ? PIECE_KEYS.settlement : PIECE_KEYS.city],
    post: 'sprite',
    fit:
      kind === 'settlement'
        ? { maxWidth: 200, maxHeight: 190, bottomY: 244, centerX: PIECE_IMAGE.anchorX }
        : { maxWidth: 236, maxHeight: 220, bottomY: 242, centerX: PIECE_IMAGE.anchorX },
    transparent: true,
  };
}

/** Composition-variant tile keys (hex-<terrain>-2, hex-<terrain>-3). */
export const TILE_VARIANT_KEYS: string[] = (Object.keys(TILE_KEYS) as (keyof typeof TILE_KEYS)[]).flatMap((t) => [
  tileVariantKey(t, 2),
  tileVariantKey(t, 3),
]);

function roadEntry(orientation: RoadOrientation): ArtEntry {
  const dir =
    orientation === 'vertical'
      ? 'running straight up and down the image'
      : orientation === 'down'
        ? 'running diagonally from the upper-left to the lower-right'
        : 'running diagonally from the lower-left to the upper-right';
  return {
    key: ROAD_KEYS[orientation],
    kind: 'edit',
    prompt:
      `The first image shows a flat light-grey plank shape ${dir}. Repaint that exact shape as a short segment of cobbled road: fitted light grey cobblestones with pale mortar lines and a slightly raised kerb of small stones along both long sides, ends gently rounded. ` +
      'Keep exactly the same position, length, width and orientation as the plank; do not extend or bend it; nothing outside the plank; transparent background. ' +
      'Seen from the same oblique camera as the reference tile (top-left light, soft shadow to the lower right). ' +
      NEUTRAL +
      STYLE_REF,
    width: ROAD_IMAGE.width,
    height: ROAD_IMAGE.height,
    apiSize: `${ROAD_IMAGE.width * 4}x${ROAD_IMAGE.height * 4}`,
    quality: 'medium',
    template: { type: 'road', orientation },
    mask: true,
    references: [TILE_KEYS.forest],
    post: 'road',
    transparent: true,
  };
}

function pieceEntry(key: string, prompt: string, fit: Fit): ArtEntry {
  return {
    key,
    kind: 'edit',
    prompt: PIECE_COMMON + ' ' + prompt + STYLE_REF,
    width: PIECE_IMAGE.width,
    height: PIECE_IMAGE.height,
    apiSize: `${PIECE_IMAGE.width * 4}x${PIECE_IMAGE.height * 4}`,
    quality: 'medium',
    template: { type: 'piece' },
    references: [TILE_KEYS.forest],
    post: 'sprite',
    fit,
    transparent: true,
  };
}

function harborEntry(kind: keyof typeof HARBOR_KEYS): ArtEntry {
  const cargo: Record<keyof typeof HARBOR_KEYS, string> = {
    generic: 'The ship carries mixed crates and barrels.',
    brick: 'The ship is visibly loaded with a stack of red clay bricks.',
    lumber: 'The ship is visibly loaded with cut timber logs and planks.',
    ore: 'The ship is visibly loaded with grey rocks and glinting metal ore.',
    grain: 'The ship is visibly loaded with golden wheat sheaves and grain sacks.',
    wool: 'The ship is visibly loaded with white wool bales and a sheep on deck.',
  };
  const rate = kind === 'generic' ? '3:1' : '2:1';
  return {
    key: HARBOR_KEYS[kind],
    kind: 'edit',
    prompt: HARBOR_COMMON.replace('{RATE}', rate) + ' ' + cargo[kind] + STYLE_REF,
    width: HARBOR_IMAGE.width,
    height: HARBOR_IMAGE.height,
    apiSize: `${HARBOR_IMAGE.width * 4}x${HARBOR_IMAGE.height * 4}`,
    quality: 'medium',
    template: { type: 'piece' },
    references: [TILE_KEYS.forest],
    post: 'sprite',
    fit: { maxWidth: 210, maxHeight: 190, bottomY: 232, centerX: HARBOR_IMAGE.anchorX },
    transparent: true,
  };
}

function cardEntry(key: string, title: string, prompt: string): ArtEntry {
  return {
    key,
    kind: 'generate',
    prompt: CARD_COMMON.replace('{TITLE}', title) + ' ' + prompt,
    width: CARD_IMAGE.width,
    height: CARD_IMAGE.height,
    // 5:7, both divisible by 16
    apiSize: '1040x1456',
    quality: 'medium',
    post: 'card',
    transparent: false,
  };
}

export const MANIFEST: ArtEntry[] = [
  // Tiles (forest first: it is the style reference for everything else)
  tileEntry('forest'),
  tileEntry('hills'),
  tileEntry('mountains'),
  tileEntry('fields'),
  tileEntry('pasture'),
  tileEntry('desert'),
  ...(['forest', 'hills', 'mountains', 'fields', 'pasture', 'desert'] as const).flatMap((t) => [tileEntry(t, 2), tileEntry(t, 3)]),

  // Tokens: drawn in code
  ...[2, 3, 4, 5, 6, 8, 9, 10, 11, 12].map<ArtEntry>((n) => ({
    key: tokenKey(n),
    kind: 'code',
    prompt: '',
    width: TOKEN_IMAGE.size,
    height: TOKEN_IMAGE.size,
    apiSize: '',
    quality: 'low',
    post: 'token',
    transparent: true,
    token: n,
  })),

  // Roads
  roadEntry('vertical'),
  roadEntry('down'),
  roadEntry('up'),

  // Pieces
  pieceEntry(
    PIECE_KEYS.settlement,
    'Object: a small village bustling with life, on a roughly elliptical patch of ground: a cluster of three or four small medieval cottages with steep gabled roofs around a tiny village square with a stone well, ' +
      'a few tiny villagers walking about, a little wooden pen with a couple of sheep and a cow, a hay cart, a small market stall with an awning, thin chimney smoke. ' +
      'Chunky simplified miniature proportions, compact so the whole village reads clearly at a small size; the buildings stay low (one storey) so it looks clearly smaller and humbler than a walled city.' +
      NEUTRAL,
    { maxWidth: 200, maxHeight: 190, bottomY: 244, centerX: PIECE_IMAGE.anchorX },
  ),
  pieceEntry(
    PIECE_KEYS.city,
    'Object: a larger walled medieval town on a roughly elliptical patch of ground: a crenellated stone wall with a gatehouse and open gate in front, inside it a tight dense cluster of taller two-storey buildings, ' +
      'a church with a tall spire or a stone keep tower rising in the middle, small banners on the towers, tiny townsfolk in the gate and on the wall walk, a cart at the gate. ' +
      'Chunky simplified miniature proportions, clearly grander and taller than a village.' +
      NEUTRAL,
    { maxWidth: 236, maxHeight: 220, bottomY: 242, centerX: PIECE_IMAGE.anchorX },
  ),
  pieceEntry(
    PIECE_KEYS.robber,
    'Object: the robber: a mysterious hooded figure in a long dark charcoal-grey cloak, face hidden in shadow, holding a small sack over one shoulder, standing upright. Colours: dark grey and near-black only, with subtle lighter grey highlights on the folds.',
    { maxWidth: 96, maxHeight: 150, bottomY: 232, centerX: PIECE_IMAGE.anchorX },
  ),

  // Per-player full-colour buildings
  ...([1, 2, 3, 4] as const).flatMap((p) => [playerPieceEntry('settlement', p), playerPieceEntry('city', p)]),

  // Harbors
  harborEntry('generic'),
  harborEntry('brick'),
  harborEntry('lumber'),
  harborEntry('ore'),
  harborEntry('grain'),
  harborEntry('wool'),

  // Sea
  {
    key: MISC_KEYS.sea,
    kind: 'generate',
    prompt:
      'A seamless, tileable texture of calm open sea water seen from directly above at a slight angle: deep teal-blue water with gentle wind ripples, small soft whitecaps and subtle lighter turquoise streaks, painted realistic board-game style with soft natural lighting. ' +
      'Uniform across the whole image with no horizon, no shore, no objects, no large distinctive features, no vignette, so that it repeats without visible seams.',
    width: 512,
    height: 512,
    apiSize: '1024x1024',
    quality: 'medium',
    post: 'seamless',
    transparent: false,
  },

  // Resource cards
  cardEntry(CARD_KEYS.brick, 'BRICK', 'Illustration: a neat stack of fired red clay bricks beside a small brick kiln on a red-brown clay hillside, warm light.'),
  cardEntry(CARD_KEYS.lumber, 'LUMBER', 'Illustration: a pile of freshly cut timber logs and an axe stuck in a stump at the edge of a dense pine forest.'),
  cardEntry(CARD_KEYS.ore, 'ORE', 'Illustration: chunks of grey rock veined with glinting silver ore beside a mine entrance in a rocky snow-capped mountain.'),
  cardEntry(CARD_KEYS.grain, 'GRAIN', 'Illustration: golden sheaves of ripe wheat bound with twine in a sunlit wheat field with a windmill in the distance.'),
  cardEntry(CARD_KEYS.wool, 'WOOL', 'Illustration: a fluffy white sheep with a bundle of shorn wool in a green rolling pasture with a wooden fence.'),

  // Development cards
  cardEntry(
    DEV_CARD_KEYS.knight,
    'KNIGHT',
    'Illustration: a medieval knight in plate armour on foot holding a sword and shield, standing guard on a hilltop at dusk, heroic composition.',
  ),
  cardEntry(
    DEV_CARD_KEYS.roadBuilding,
    'ROAD BUILDING',
    'Illustration: workers laying a cobbled road through green countryside with a cart of paving stones and surveying tools.',
  ),
  cardEntry(
    DEV_CARD_KEYS.yearOfPlenty,
    'YEAR OF PLENTY',
    'Illustration: an overflowing cornucopia horn of plenty spilling wheat, wool, bricks, ore and timber onto a table at a harvest festival.',
  ),
  cardEntry(
    DEV_CARD_KEYS.monopoly,
    'MONOPOLY',
    'Illustration: a shrewd merchant in fine robes at a market stall gathering all the goods to himself, coin chests and a ledger, cunning expression.',
  ),
  cardEntry(
    DEV_CARD_KEYS.victoryPoint,
    'VICTORY POINT',
    'Illustration: a golden laurel wreath around a shining star on a deep royal-blue velvet background with subtle heraldic ornament.',
  ),
  {
    key: MISC_KEYS.cardBack,
    kind: 'generate',
    prompt:
      'The back of a playing card, portrait format, full-bleed: a symmetrical ornamental design of a small hexagonal island with a compass rose, framed by interlocking Celtic-style knotwork in aged gold on deep forest-green leather texture. No text. Painted realistic board-game style.',
    width: CARD_IMAGE.width,
    height: CARD_IMAGE.height,
    apiSize: '1040x1456',
    quality: 'medium',
    post: 'card',
    transparent: false,
  },
];

export function findEntry(key: string): ArtEntry | undefined {
  return MANIFEST.find((e) => e.key === key);
}

// ---------------------------------------------------------------------------
// Character portraits: one painted play card per bot name, plus a few for the human.
// ---------------------------------------------------------------------------

const TEAM_COLOUR: Record<PortraitSpec['team'], string> = {
  blue: 'blue (#3b6fd6)',
  orange: 'orange (#e8862e)',
  white: 'ivory white (#f2efe4)',
  red: 'red (#d33b2f)',
};

const PORTRAIT_COMMON =
  'A character portrait playing card, full-bleed portrait format, no card border needed. Painted, realistic style matching a tabletop board game with warm, slightly aged palette, ' +
  'like a hand-painted miniature bust photographed under soft studio light. Half-length view so hands and arms can show, friendly caricature with plenty of personality, plain warm vignette background. ' +
  'At the bottom is a small parchment banner with the bold title text "{TITLE}" and nothing else written.';

function portraitEntry(p: PortraitSpec): ArtEntry {
  return {
    key: p.key,
    kind: 'generate',
    prompt: `${PORTRAIT_COMMON.replace('{TITLE}', p.title)} Character: ${p.hint}. Pose: ${p.pose}. Their clothing and accessories prominently feature the team colour ${TEAM_COLOUR[p.team]}.`,
    width: CARD_IMAGE.width,
    height: CARD_IMAGE.height,
    apiSize: '1040x1456',
    quality: 'medium',
    post: 'card',
    transparent: false,
  };
}

export const PORTRAIT_ENTRIES: ArtEntry[] = PORTRAITS.map(portraitEntry);
MANIFEST.push(...PORTRAIT_ENTRIES);

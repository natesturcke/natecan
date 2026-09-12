# natecan

A solo, browser-based settlement game against three bots, built on the Catan base rules. React + TypeScript + Vite shell, Phaser board with an oblique camera, and an in-house rules engine with three bot tiers.

## Run it

```
npm install
npm run dev          # http://localhost:5173
npm test             # engine, rules and bot tests
npm run simulate -- --games 20 --bots hard,medium,medium,easy
```

## Layout

- `src/engine/` pure rules: state, legal-action enumerator, reducer, board topology. No DOM.
- `src/bots/` Easy (random), Medium (value function with greedy own-turn lookahead), Hard (expectimax over the next opponent's dice).
- `src/game/` controller that applies actions, keeps history and paces bot turns.
- `src/board-phaser/` Phaser scene, geometry and asset contract.
- `src/ui/` React screens, prompts, dialogs, animations.
- `scripts/` art generation (`npm run art`, needs `OPENAI_API_KEY` in `.env`), contact sheet, PNG optimisation, headless simulation.
- `public/art/` committed generated artwork.

## Regenerating art

```
npm run art -- --only hex-fields-2 --force hex-fields-2   # new image from the API
npm run art -- --only city-3 --reprocess                  # re-run post-processing only
npm run art:sheet                                         # contact sheet + sample board
npx tsx scripts/optimize-art.ts                           # shrink PNGs in place
```

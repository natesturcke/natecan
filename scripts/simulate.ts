/**
 * Headless bot tournament. Usage:
 *   npx tsx scripts/simulate.ts --games 50 --bots easy,medium,medium,hard --seed 1
 */
import { createBot } from '../src/bots/registry';
import '../src/bots/register-all';
import { InlineBotRunner } from '../src/bots/runner';
import { GameController } from '../src/game/GameController';
import { newGame } from '../src/engine/state';
import type { Bot } from '../src/bots/Bot';
import type { Difficulty, PlayerId, PlayerSetup } from '../src/engine/types';
import { totalVictoryPoints } from '../src/engine/rules/victory';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const games = Number(arg('games', '20'));
const seed0 = Number(arg('seed', '1'));
const difficulties = arg('bots', 'easy,easy,easy,easy').split(',') as Difficulty[];
if (difficulties.length !== 4) throw new Error('Need exactly 4 bots');

const wins = [0, 0, 0, 0];
let totalTurns = 0;
let unfinished = 0;
const decisionMs: number[][] = [[], [], [], []];
const t0 = performance.now();

for (let g = 0; g < games; g++) {
  const seed = seed0 + g;
  const players: PlayerSetup[] = difficulties.map((d, i) => ({ name: `P${i}:${d}`, color: '#000', kind: 'bot', difficulty: d }));
  const bots = new Map<PlayerId, Bot>(difficulties.map((d, i) => [i as PlayerId, createBot(d)]));
  const runner = new InlineBotRunner(bots, seed, 300);
  const controller = new GameController(newGame({ seed, players }), { runner, maxActions: 8000 });
  controller.runToCompletionSync((p, s, l) => {
    const t = performance.now();
    const a = runner.decideSync(p, s, l);
    decisionMs[p].push(performance.now() - t);
    return a;
  });
  const s = controller.state;
  totalTurns += s.turn.number;
  if (s.phase.kind === 'ended') wins[s.phase.winner]++;
  else {
    unfinished++;
    const vps = s.players.map((p) => totalVictoryPoints(s, p.id));
    console.log(`seed ${seed} unfinished after ${s.actionCount} actions; VPs ${vps.join('/')}`);
  }
}

const elapsed = (performance.now() - t0) / 1000;
console.log(`games=${games} elapsed=${elapsed.toFixed(1)}s avgTurns=${(totalTurns / games).toFixed(1)} unfinished=${unfinished}`);
difficulties.forEach((d, i) => {
  const ms = decisionMs[i];
  const avg = ms.reduce((a, b) => a + b, 0) / Math.max(1, ms.length);
  const sorted = ms.slice().sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  console.log(`P${i} ${d.padEnd(6)} wins=${wins[i]} (${((100 * wins[i]) / games).toFixed(0)}%)  avg=${avg.toFixed(2)}ms p95=${p95.toFixed(2)}ms`);
});

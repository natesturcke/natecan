import { useState } from 'react';
import type { Difficulty, PlayerSetup, SetupVariant } from '@/engine/types';

export interface MenuChoice {
  seed: number;
  players: PlayerSetup[];
  setupVariant: SetupVariant;
}

const BOT_NAMES = ['Blue', 'Orange', 'White'];
const BOT_COLORS = ['#3b6fd6', '#e8862e', '#f2efe4'];

export function MainMenu({ onStart }: { onStart: (choice: MenuChoice) => void }): React.JSX.Element {
  const [name, setName] = useState('You');
  const [difficulties, setDifficulties] = useState<Difficulty[]>(['medium', 'medium', 'medium']);
  const [seed, setSeed] = useState(() => String(Math.floor(Math.random() * 1_000_000)));
  const [variant, setVariant] = useState<SetupVariant>('spiral');
  return (
    <div className="menu">
      <div className="menu-card">
        <h1>natecan</h1>
        <p className="muted">Settle the island against three bots. The game tells you what to do at every step.</p>
        <label>
          Your name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={16} />
        </label>
        <div className="section-title">Opponents</div>
        {BOT_NAMES.map((n, i) => (
          <label key={n} className="row">
            <span className="swatch" style={{ background: BOT_COLORS[i] }} /> {n}
            <select value={difficulties[i]} onChange={(e) => setDifficulties((d) => d.map((x, j) => (j === i ? (e.target.value as Difficulty) : x)))}>
              <option value="easy">Easy: plays at random</option>
              <option value="medium">Medium: weighs every move</option>
              <option value="hard">Hard: looks ahead</option>
            </select>
          </label>
        ))}
        <details>
          <summary>Advanced</summary>
          <label>
            Board seed
            <input value={seed} onChange={(e) => setSeed(e.target.value)} />
          </label>
          <label>
            Number tokens
            <select value={variant} onChange={(e) => setVariant(e.target.value as SetupVariant)}>
              <option value="spiral">Rulebook spiral (balanced)</option>
              <option value="random">Fully random</option>
            </select>
          </label>
        </details>
        <button
          className="btn primary big"
          onClick={() =>
            onStart({
              seed: Number(seed) || 1,
              setupVariant: variant,
              players: [
                { name: name.trim() || 'You', color: '#d33b2f', kind: 'human' },
                ...BOT_NAMES.map((n, i) => ({ name: n, color: BOT_COLORS[i], kind: 'bot' as const, difficulty: difficulties[i] })),
              ],
            })
          }
        >
          Start game
        </button>
      </div>
    </div>
  );
}

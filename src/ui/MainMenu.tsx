import { useMemo, useState } from 'react';
import type { Difficulty, PlayerSetup, SetupVariant } from '@/engine/types';
import { listGames } from '@/game/persistence';
import { MenuBackdrop } from './MenuBackdrop';
import { botNamesFor } from './names';
import { Portrait } from './Portrait';
import { humanPortraitKey, portraitKey } from './portraits';

export interface MenuChoice {
  seed: number;
  players: PlayerSetup[];
  setupVariant: SetupVariant;
}

const BOT_COLORS = ['#3b6fd6', '#e8862e', '#f2efe4'];
const BOT_KEYS = ['blue', 'orange', 'white'] as const;
const HUMAN_COLOR = '#d33b2f';

export function MainMenu({ onStart, onResume }: { onStart: (choice: MenuChoice) => void; onResume?: (id: string) => void }): React.JSX.Element {
  const [name, setName] = useState('You');
  const saved = useMemo(() => listGames().slice(0, 3), []);
  const [difficulties, setDifficulties] = useState<Difficulty[]>(['medium', 'medium', 'medium']);
  const [seed, setSeed] = useState(() => String(Math.floor(Math.random() * 1_000_000)));
  const [variant, setVariant] = useState<SetupVariant>('spiral');
  const seedNumber = Number(seed) || 1;
  const names = botNamesFor(seedNumber);
  const BOT_NAMES = BOT_KEYS.map((k) => names[k]);
  const reshuffle = () => setSeed(String(Math.floor(Math.random() * 1_000_000)));
  return (
    <div className="menu">
      <MenuBackdrop />
      <div className="menu-card">
        <h1>natecan</h1>
        <p className="muted">Settle the island against three bots. The game tells you what to do at every step.</p>

        {saved.length > 0 && onResume && (
          <div className="resume-list">
            <div className="section-title">Continue a game</div>
            {saved.map((g) => (
              <button key={g.id} className="btn resume" onClick={() => onResume(g.id)} title={`Game ${g.id}: reopen at ${new Date(g.savedAt).toLocaleString()}`}>
                <span>
                  {g.choice.players[0].name} vs {g.choice.players.slice(1).map((p) => p.name).join(', ')}
                </span>
                <span className="muted">
                  {g.actions.length} moves · {new Date(g.savedAt).toLocaleDateString()}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* The table: your card and the three you are up against. */}
        <div className="menu-table">
          <div className="play-card you" style={{ borderColor: HUMAN_COLOR }}>
            <Portrait portraitKey={humanPortraitKey(seedNumber)} name={name.trim() || 'You'} color={HUMAN_COLOR} size={84} />
            <input className="play-card-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={16} aria-label="Your name" />
            <span className="play-card-role">You</span>
          </div>
          {BOT_NAMES.map((n, i) => (
            <div key={n} className="play-card" style={{ borderColor: BOT_COLORS[i] }}>
              <Portrait portraitKey={portraitKey(n)} name={n} color={BOT_COLORS[i]} size={84} />
              <span className="play-card-name">{n}</span>
              <select value={difficulties[i]} onChange={(e) => setDifficulties((d) => d.map((x, j) => (j === i ? (e.target.value as Difficulty) : x)))} aria-label={`${n} difficulty`}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          ))}
        </div>
        <div className="menu-table-actions">
          <button className="btn small" onClick={reshuffle} title="Deal a different set of opponents and a different island">
            Deal a different table
          </button>
          <span className="muted">Easy plays at random · Medium weighs every move · Hard looks ahead</span>
        </div>

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
              seed: seedNumber,
              setupVariant: variant,
              players: [
                { name: name.trim() || 'You', color: HUMAN_COLOR, kind: 'human' },
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

import { hiddenVictoryPoints, totalVictoryPoints } from '@/engine/rules/victory';
import type { GameState, PlayerId } from '@/engine/types';
import { Portrait } from './Portrait';
import { humanPortraitKey, portraitKey } from './portraits';

interface ScoreItem {
  key: string;
  art: string;
  label: string;
  points: number;
  count: number;
  /** Card-shaped art (portrait ratio) rather than a piece sprite. */
  card?: boolean;
}

function scoreItems(state: GameState, player: PlayerId): ScoreItem[] {
  const settlements = state.buildings.filter((b) => b && b.owner === player && b.kind === 'settlement').length;
  const cities = state.buildings.filter((b) => b && b.owner === player && b.kind === 'city').length;
  const vpCards = hiddenVictoryPoints(state, player);
  const road = state.longestRoad.holder === player;
  const army = state.largestArmy.holder === player;
  return [
    { key: 'settlements', art: `/art/settlement-${player + 1}.png`, label: 'Settlements', points: settlements, count: settlements },
    { key: 'cities', art: `/art/city-${player + 1}.png`, label: 'Cities', points: cities * 2, count: cities },
    { key: 'road', art: '/art/road-vertical.png', label: 'Longest Road', points: road ? 2 : 0, count: road ? 1 : 0 },
    { key: 'army', art: '/art/dev-knight.png', label: 'Largest Army', points: army ? 2 : 0, count: army ? 1 : 0, card: true },
    { key: 'vp', art: '/art/dev-vp.png', label: 'Victory Point cards', points: vpCards, count: vpCards, card: true },
  ].filter((i) => i.count > 0);
}

function hideOnError(e: React.SyntheticEvent<HTMLImageElement>): void {
  e.currentTarget.style.visibility = 'hidden';
}

/** The winner and where every point came from, shown with the game's own art, then the standings. */
export function GameOver({ state, human, onMenu }: { state: GameState; human: PlayerId; onMenu: () => void }): React.JSX.Element | null {
  if (state.phase.kind !== 'ended') return null;
  const winner = state.phase.winner;
  const p = state.players[winner];
  const total = totalVictoryPoints(state, winner);
  const vpCards = hiddenVictoryPoints(state, winner);
  const items = scoreItems(state, winner);
  const portraitFor = (id: PlayerId) => (id === human ? humanPortraitKey(state.seed) : portraitKey(state.players[id].name));
  const others = state.players
    .filter((q) => q.id !== winner)
    .map((q) => ({ player: q, total: totalVictoryPoints(state, q.id), items: scoreItems(state, q.id) }))
    .sort((a, b) => b.total - a.total);

  return (
    <div className="game-over" role="dialog" aria-label="Game over">
      <div className="game-over-card">
        <div className="game-over-head">
          <Portrait portraitKey={portraitFor(winner)} name={p.name} color={p.color} size={92} className="game-over-portrait" />
          <div>
            <div className="game-over-kicker">{winner === human ? 'Victory' : 'Game over'}</div>
            <h1 className="game-over-title" style={{ color: p.color }}>
              {winner === human ? 'You win!' : `${p.name} wins`}
            </h1>
            <div className="game-over-total">
              {total} points
              {vpCards > 0 && <span className="muted"> · {vpCards} hidden Victory Point card{vpCards === 1 ? '' : 's'} revealed</span>}
            </div>
          </div>
        </div>
        <div className="score-row">
          {items.map((i) => (
            <div key={i.key} className="score-item">
              <div className={`score-art ${i.card ? 'card' : 'piece'}`}>
                {Array.from({ length: Math.min(i.count, 5) }, (_, k) => (
                  <img key={k} src={i.art} alt="" draggable={false} style={{ marginLeft: k === 0 ? 0 : i.card ? -28 : -22, zIndex: k }} onError={hideOnError} />
                ))}
                {i.count > 5 && <span className="score-more">+{i.count - 5}</span>}
              </div>
              <div className="score-label">
                {i.count > 1 ? `${i.count} ` : ''}
                {i.label}
              </div>
              <div className="score-points">+{i.points}</div>
            </div>
          ))}
          <div className="score-item total">
            <div className="score-equals">=</div>
            <div className="score-label">Total</div>
            <div className="score-points">{total}</div>
          </div>
        </div>

        <div className="standings">
          {others.map(({ player: q, total: t, items: qi }, rank) => (
            <div key={q.id} className="standing" style={{ borderColor: q.color }}>
              <span className="standing-rank">{rank + 2}</span>
              <Portrait portraitKey={portraitFor(q.id)} name={q.name} color={q.color} size={30} className="standing-portrait" />
              <span className="standing-name">{q.id === human ? 'You' : q.name}</span>
              <span className="standing-items">
                {qi.map((i) => (
                  <span key={i.key} className="standing-item" title={`${i.label}: +${i.points}`}>
                    <img src={i.art} alt="" draggable={false} className={i.card ? 'card' : 'piece'} onError={hideOnError} />
                    {i.count > 1 && <span className="standing-count">×{i.count}</span>}
                  </span>
                ))}
                {qi.length === 0 && <span className="muted">nothing scored</span>}
              </span>
              <span className="standing-total">{t}</span>
            </div>
          ))}
        </div>

        <div className="game-over-actions">
          <button className="btn primary big" onClick={onMenu}>
            Back to menu
          </button>
        </div>
      </div>
    </div>
  );
}

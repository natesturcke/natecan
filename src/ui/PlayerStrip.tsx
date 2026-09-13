import { bagTotal } from '@/engine/bag';
import { publicVictoryPoints, totalVictoryPoints } from '@/engine/rules/victory';
import { currentActor } from '@/engine/state';
import type { GameState, PlayerId } from '@/engine/types';
import { Portrait } from './Portrait';
import { humanPortraitKey, portraitKey } from './portraits';

export function PlayerStrip({ state, human }: { state: GameState; human: PlayerId }): React.JSX.Element {
  const actor = state.phase.kind === 'ended' ? null : currentActor(state);
  return (
    <div className="player-strip">
      {state.players.map((p) => {
        const vp = p.id === human ? totalVictoryPoints(state, p.id) : publicVictoryPoints(state, p.id);
        const isTurn = state.turn.current === p.id && state.phase.kind !== 'ended';
        const isActor = actor === p.id;
        const hasRoad = state.longestRoad.holder === p.id;
        const hasArmy = state.largestArmy.holder === p.id;
        const hidden = p.id !== human && p.devCards.length > 0;
        // Where the points come from.
        const settlements = state.buildings.filter((b) => b && b.owner === p.id && b.kind === 'settlement').length;
        const cities = state.buildings.filter((b) => b && b.owner === p.id && b.kind === 'city').length;
        const vpCards = p.id === human ? p.devCards.filter((c) => c === 'victoryPoint').length : 0;
        const breakdown: { label: string; points: number; note?: string }[] = [
          { label: `${settlements} settlement${settlements === 1 ? '' : 's'}`, points: settlements, note: '1 point each' },
          { label: `${cities} cit${cities === 1 ? 'y' : 'ies'}`, points: cities * 2, note: '2 points each' },
          { label: 'Longest Road', points: hasRoad ? 2 : 0, note: hasRoad ? `held with ${p.roadLength}` : 'needs 5+ roads and the most' },
          { label: 'Largest Army', points: hasArmy ? 2 : 0, note: hasArmy ? `held with ${p.knightsPlayed} knights` : 'needs 3+ knights and the most' },
          ...(p.id === human ? [{ label: `${vpCards} Victory Point card${vpCards === 1 ? '' : 's'}`, points: vpCards, note: 'hidden from others' }] : []),
        ];
        const facts: { label: string; value: string; title: string; held?: boolean }[] = [
          {
            label: 'VP',
            value: `${vp}${hidden ? '+' : ''}`,
            title: hidden ? 'Victory points you can see. They may hold hidden point cards.' : 'Victory points. First to 10 wins.',
          },
          { label: 'Cards', value: `${bagTotal(p.resources)}`, title: 'Resource cards in hand' },
          { label: 'Dev cards', value: `${p.devCards.length + p.newDevCards.length}`, title: 'Development cards held' },
          {
            label: 'Knights',
            value: `${p.knightsPlayed}`,
            title: hasArmy
              ? 'Knights played. Holds Largest Army (2 points). Knights come from Development cards (1 Ore, 1 Grain, 1 Wool).'
              : 'Knights played. Knights come from Development cards (1 Ore, 1 Grain, 1 Wool); playing one moves the robber. Three or more can win Largest Army.',
            held: hasArmy,
          },
          { label: 'Longest road', value: `${p.roadLength}`, title: hasRoad ? 'Longest continuous road. Holds Longest Road (2 points).' : 'Longest continuous road. Five or more can win Longest Road.', held: hasRoad },
        ];
        return (
          <div key={p.id} data-player={p.id} className={`player-card ${isTurn ? 'turn' : ''} ${isActor ? 'actor' : ''}`} style={{ borderColor: p.color }}>
            <Portrait portraitKey={p.id === human ? humanPortraitKey(state.seed) : portraitKey(p.name)} name={p.name} color={p.color} size={46} className="player-portrait" />
            <div className="player-body">
              <div className="player-head">
                <span className="swatch" style={{ background: p.color }} />
                <span className="player-name">{p.id === human ? 'You' : p.name}</span>
              </div>
              <dl className="player-facts">
                {facts.map((f) => (
                  <div key={f.label} className={`fact ${f.held ? 'held' : ''}`} title={f.title}>
                    <dt>{f.label}</dt>
                    <dd>
                      {f.value}
                      {f.held && <span className="fact-star">★</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="vp-pop" aria-hidden="true">
              <div className="vp-pop-title">
                {p.id === human ? 'Your' : `${p.name}'s`} {vp}
                {hidden ? '+' : ''} point{vp === 1 ? '' : 's'}
              </div>
              {breakdown.map((b) => (
                <div key={b.label} className={`vp-row ${b.points > 0 ? 'scoring' : ''}`}>
                  <span className="vp-row-label">{b.label}</span>
                  <span className="vp-row-note">{b.note}</span>
                  <span className="vp-row-points">{b.points > 0 ? `+${b.points}` : '–'}</span>
                </div>
              ))}
              {hidden && <div className="vp-pop-hint">They hold {p.devCards.length} development card{p.devCards.length === 1 ? '' : 's'}; some may be hidden Victory Points.</div>}
              <div className="vp-pop-hint">First to 10 points wins.</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

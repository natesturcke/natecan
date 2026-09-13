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
        const facts: { label: string; value: string; title: string; held?: boolean }[] = [
          {
            label: 'VP',
            value: `${vp}${hidden ? '+' : ''}`,
            title: hidden ? 'Victory points you can see. They may hold hidden point cards.' : 'Victory points. First to 10 wins.',
          },
          { label: 'Cards', value: `${bagTotal(p.resources)}`, title: 'Resource cards in hand' },
          { label: 'Dev cards', value: `${p.devCards.length + p.newDevCards.length}`, title: 'Development cards held' },
          { label: 'Knights', value: `${p.knightsPlayed}`, title: hasArmy ? 'Knights played. Holds Largest Army (2 points).' : 'Knights played. Three or more can win Largest Army.', held: hasArmy },
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
          </div>
        );
      })}
    </div>
  );
}

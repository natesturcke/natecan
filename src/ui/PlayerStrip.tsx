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
        return (
          <div key={p.id} data-player={p.id} className={`player-card ${isTurn ? 'turn' : ''} ${isActor ? 'actor' : ''}`} style={{ borderColor: p.color }}>
            <Portrait portraitKey={p.id === human ? humanPortraitKey(state.seed) : portraitKey(p.name)} name={p.name} color={p.color} size={40} className="player-portrait" />
            <div className="player-body">
              <div className="player-head">
                <span className="swatch" style={{ background: p.color }} />
                <span className="player-name">{p.id === human ? 'You' : p.name}</span>
                <span className="vp" title="Victory points">
                  {vp}
                  {p.id !== human && p.devCards.length > 0 ? '+' : ''}
                </span>
              </div>
              <div className="player-stats">
                <span title="Resource cards in hand">{bagTotal(p.resources)} cards</span>
                <span title="Development cards held">{p.devCards.length + p.newDevCards.length} dev</span>
                <span title="Knights played">{p.knightsPlayed} knights</span>
                <span title="Longest continuous road">road {p.roadLength}</span>
              </div>
              <div className="player-badges">
                {state.longestRoad.holder === p.id && <span className="badge">Longest Road</span>}
                {state.largestArmy.holder === p.id && <span className="badge">Largest Army</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

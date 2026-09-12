import { legalActions } from '@/engine/legal';
import type { GameState, PlayerId } from '@/engine/types';
import { Modal } from './Modal';
import { bagText } from '../text';

export function TradeResolveDialog({
  state,
  human,
  onConfirm,
  onCancel,
}: {
  state: GameState;
  human: PlayerId;
  onConfirm: (withPlayer: PlayerId) => void;
  onCancel: () => void;
}): React.JSX.Element | null {
  if (state.phase.kind !== 'tradeResolve') return null;
  const { offer, responses } = state.phase;
  const legal = legalActions(state, human);
  const confirmable = new Set(legal.flatMap((a) => (a.type === 'TRADE_CONFIRM' ? [a.with] : [])));
  return (
    <Modal title="Choose who to trade with">
      <p className="muted">
        You offered {bagText(offer.give)} for {bagText(offer.want)}.
      </p>
      <div className="responses">
        {(Object.keys(responses).map(Number) as PlayerId[]).map((p) => {
          const r = responses[p];
          const name = state.players[p].name;
          if (r.kind === 'accept') {
            return (
              <div key={p} className="response">
                <span>
                  <b>{name}</b> accepts.
                </span>
                <button className="btn primary" disabled={!confirmable.has(p)} onClick={() => onConfirm(p)}>
                  Trade with {name}
                </button>
              </div>
            );
          }
          if (r.kind === 'counter') {
            return (
              <div key={p} className="response">
                <span>
                  <b>{name}</b> counters: you give {bagText(r.give)}, you get {bagText(r.want)}.
                </span>
                <button className="btn primary" disabled={!confirmable.has(p)} onClick={() => onConfirm(p)}>
                  Accept counter
                </button>
              </div>
            );
          }
          return (
            <div key={p} className="response muted">
              <span>
                <b>{name}</b> declines.
              </span>
            </div>
          );
        })}
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onCancel}>
          No trade
        </button>
      </div>
    </Modal>
  );
}

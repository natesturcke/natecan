import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface Anchor {
  x: number;
  y: number;
}

export interface ConfirmPopoverProps {
  anchor: Anchor | null;
  question: string;
  note?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Floating Confirm / Cancel card positioned next to the thing the player just clicked,
 * so confirming never means travelling across the screen. Enter confirms, Esc cancels.
 */
export function ConfirmPopover({ anchor, question, note, confirmLabel = 'Confirm', onConfirm, onCancel }: ConfirmPopoverProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; arrow: 'up' | 'down' | 'none' }>({ left: 0, top: 0, arrow: 'none' });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 12;
    if (!anchor) {
      setPos({ left: (vw - w) / 2, top: vh - h - 40, arrow: 'none' });
      return;
    }
    // Prefer above the anchor; flip below when there is no room.
    let top = anchor.y - h - 28;
    let arrow: 'up' | 'down' | 'none' = 'down';
    if (top < 80) {
      top = anchor.y + 28;
      arrow = 'up';
    }
    let left = anchor.x - w / 2;
    left = Math.max(margin, Math.min(vw - w - margin, left));
    top = Math.max(margin, Math.min(vh - h - margin, top));
    setPos({ left, top, arrow });
  }, [anchor, question, note]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onConfirm, onCancel]);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button.primary')?.focus({ preventScroll: true });
  }, [question]);

  return (
    <div ref={ref} className={`confirm-popover arrow-${pos.arrow}`} style={{ left: pos.left, top: pos.top }} role="dialog" aria-label={question}>
      <div className="confirm-question">{question}</div>
      {note && <div className="confirm-note">{note}</div>}
      <div className="confirm-actions">
        <button className="btn" onClick={onCancel}>
          Cancel <kbd>Esc</kbd>
        </button>
        <button className="btn primary" onClick={onConfirm}>
          {confirmLabel} <kbd>↵</kbd>
        </button>
      </div>
    </div>
  );
}

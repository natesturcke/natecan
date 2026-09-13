import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Centred dialog rendered at the document root, so a transformed ancestor (like the centred
 * bars) can never trap it. `spotlight` drops the box for a floating card-first presentation.
 */
export function Modal({ title, children, onClose, wide, spotlight }: { title: string; children: ReactNode; onClose?: () => void; wide?: boolean; spotlight?: boolean }): React.JSX.Element {
  const node = (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal ${wide ? 'wide' : ''} ${spotlight ? 'spotlight' : ''}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        {!spotlight && <h2>{title}</h2>}
        {children}
      </div>
    </div>
  );
  return typeof document === 'undefined' ? node : createPortal(node, document.body);
}

import { useState } from 'react';
import type { StepPrompt } from './prompts';

export interface PromptButton {
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  primary?: boolean;
  disabled?: boolean;
  title?: string;
}

export interface PromptBarProps {
  prompt: StepPrompt;
  buttons: PromptButton[];
  /** Render as the floating card over the board instead of a docked bar. */
  floating?: boolean;
  /** Floating only: sit over the middle of the board (for pure button decisions) instead of the top edge. */
  centered?: boolean;
  /** Floating only: rendered inside the header bar rather than over the board. */
  docked?: boolean;
  /** Floating only: a compact card sitting just below the header, with a collapsible detail line. */
  below?: boolean;
}

const DETAIL_KEY = 'natecan:prompt-detail';

function readDetailPref(): boolean {
  try {
    return window.localStorage.getItem(DETAIL_KEY) !== 'hidden';
  } catch {
    return true;
  }
}

export function PromptBar({ prompt, buttons, floating, centered, docked, below }: PromptBarProps): React.JSX.Element {
  const [showDetail, setShowDetail] = useState(readDetailPref);
  const toggleDetail = () => {
    const next = !showDetail;
    setShowDetail(next);
    try {
      window.localStorage.setItem(DETAIL_KEY, next ? 'shown' : 'hidden');
    } catch {
      // Preference simply will not stick.
    }
  };
  const cls = floating ? `instruction-card ${centered ? 'centered' : ''} ${docked ? 'docked' : ''} ${below ? 'below' : ''}` : 'prompt-bar';
  const collapsible = !!below && !!prompt.detail;
  const detailVisible = prompt.detail && (!collapsible || showDetail);
  return (
    <div className={`${cls} ${prompt.yourMove ? 'yours' : 'theirs'}`} role="status" aria-live="polite">
      <div className="prompt-text">
        <div className="prompt-title">
          {prompt.title}
          {collapsible && (
            <button className="prompt-toggle" onClick={toggleDetail} title={showDetail ? 'Hide the explanation' : 'Show the explanation'} aria-expanded={showDetail}>
              {showDetail ? 'less' : 'more'}
            </button>
          )}
        </div>
        {detailVisible && <div className="prompt-detail">{prompt.detail}</div>}
      </div>
      <div className="prompt-buttons">
        {buttons.map((b) => (
          <button key={b.label} className={b.primary ? 'btn primary' : 'btn'} onClick={b.onClick} disabled={b.disabled} title={b.title}>
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}

import type { StepPrompt } from './prompts';

export interface PromptButton {
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  primary?: boolean;
  disabled?: boolean;
  title?: string;
  /** Draw attention with a slow glow, for the one button that moves the game on. */
  pulse?: boolean;
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

export function PromptBar({ prompt, buttons, floating, centered, docked, below }: PromptBarProps): React.JSX.Element {
  const cls = floating ? `instruction-card ${centered ? 'centered' : ''} ${docked ? 'docked' : ''} ${below ? 'below' : ''}` : 'prompt-bar';
  return (
    <div className={`${cls} ${prompt.yourMove ? 'yours' : 'theirs'}`} role="status" aria-live="polite">
      <div className="prompt-text">
        <div className="prompt-title">{prompt.title}</div>
        {prompt.detail && <div className="prompt-detail">{prompt.detail}</div>}
      </div>
      <div className="prompt-buttons">
        {buttons.map((b) => (
          <button key={b.label} className={`btn ${b.primary ? 'primary' : ''} ${b.pulse ? 'pulse' : ''}`} onClick={b.onClick} disabled={b.disabled} title={b.title}>
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}

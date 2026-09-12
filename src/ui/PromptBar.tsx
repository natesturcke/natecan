import type { StepPrompt } from './prompts';

export interface PromptButton {
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  primary?: boolean;
  disabled?: boolean;
  title?: string;
}

export function PromptBar({ prompt, buttons, floating }: { prompt: StepPrompt; buttons: PromptButton[]; floating?: boolean }): React.JSX.Element {
  return (
    <div className={`${floating ? 'instruction-card' : 'prompt-bar'} ${prompt.yourMove ? 'yours' : 'theirs'}`} role="status" aria-live="polite">
      <div className="prompt-text">
        <div className="prompt-title">{prompt.title}</div>
        {prompt.detail && <div className="prompt-detail">{prompt.detail}</div>}
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

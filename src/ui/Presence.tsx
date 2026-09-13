import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Keeps its children mounted for a moment after `show` turns false so they can play a short
 * exit transition, instead of vanishing on the next render. Only opacity animates on the wrapper
 * itself, so fixed-position children keep their place; inner elements shrink via CSS.
 */
export function Presence({ show, children, duration = 170 }: { show: boolean; children: ReactNode; duration?: number }): React.JSX.Element | null {
  const [mounted, setMounted] = useState(show);
  const last = useRef<ReactNode>(null);
  if (show) last.current = children;
  useEffect(() => {
    if (show) {
      setMounted(true);
      return;
    }
    const t = setTimeout(() => setMounted(false), duration);
    return () => clearTimeout(t);
  }, [show, duration]);
  if (!show && !mounted) return null;
  return <div className={`presence ${show ? 'present' : 'leaving'}`}>{show ? children : last.current}</div>;
}

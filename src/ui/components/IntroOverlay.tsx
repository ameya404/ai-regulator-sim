import { useEffect, useRef } from 'react';
import { totalYears } from '../game';
import type { SimConfig } from '../../sim';

const STEPS = [
  { n: 1, title: 'Pick your rules', text: 'Turn on safety testing, an automation tax, or a retraining fund. Off, Light or Strict.' },
  { n: 2, title: 'Press End year', text: 'Companies, workers and Congress react to your rules for a whole year.' },
  { n: 3, title: 'See what happens', text: 'Read what changed and why. Then adjust your rules and try again.' },
];

export function IntroOverlay({ config, onClose }: { config: SimConfig; onClose: () => void }) {
  const btnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    btnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" role="presentation" onClick={onClose}>
      <div className="dialog intro" role="dialog" aria-modal="true" aria-labelledby="intro-title" onClick={(e) => e.stopPropagation()}>
        <p className="eyebrow">How to play</p>
        <h2 id="intro-title">You are America's AI regulator</h2>
        <p className="lede">You have {totalYears(config)} years. Every rule helps someone and hurts someone else. Watch for the side effects.</p>
        <ol className="steps">
          {STEPS.map((s) => (
            <li key={s.n}>
              <span className="step-n" aria-hidden="true">
                {s.n}
              </span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
        <div className="dialog-actions">
          <button ref={btnRef} className="btn primary big-ish" onClick={onClose}>
            Got it, let's play
          </button>
        </div>
      </div>
    </div>
  );
}

import { Monitor, Moon, Sun } from 'lucide-react';

type Theme = 'light' | 'system' | 'dark';

export default function ThemeSwitch({
  value,
  onChange,
}: {
  value: Theme;
  onChange: (theme: Theme) => void;
}) {
  return (
    <div className="theme-switch" data-selection={value} role="group" aria-label="Color theme">
      <span className="theme-thumb" aria-hidden="true" />
      {(['light', 'system', 'dark'] as const).map((theme) => {
        const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
        const label = theme[0].toUpperCase() + theme.slice(1);
        return (
          <button
            key={theme}
            className={value === theme ? 'selected' : ''}
            aria-label={`${label} theme`}
            aria-pressed={value === theme}
            title={`${label} theme`}
            onClick={() => onChange(theme)}
          >
            <Icon size={15} />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

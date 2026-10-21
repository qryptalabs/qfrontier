'use client';

export type SectorOption = {value: string; label: string};

export default function SectorPicker({label, value, options, disabled, onChange}: {label: string; value: string; options: SectorOption[]; disabled?: boolean; onChange: (value: string) => void}) {
  return <fieldset className="m-sector-picker" disabled={disabled}>
    <legend>{label}</legend>
    <div className="m-sector-grid" role="group" aria-label={`${label} · mapa de 9 por 9`}>
      {options.map((option, index) => {
        const coordinate = /^t_(\d)_(\d)$/.exec(option.value);
        const short = coordinate ? `${String.fromCharCode(65 + Number(coordinate[1]))}${Number(coordinate[2]) + 1}` : option.label.split(' · ')[0];
        return <button key={option.value} type="button" className={value === option.value ? 'selected' : ''} title={option.label} aria-label={option.label} aria-pressed={value === option.value} onClick={() => onChange(option.value)} onKeyDown={event => {
          const delta = {ArrowLeft: -1, ArrowRight: 1, ArrowUp: -9, ArrowDown: 9}[event.key];
          if (delta === undefined) return;
          const target = index + delta;
          if (target < 0 || target >= options.length || Math.abs(delta) === 1 && Math.floor(target / 9) !== Math.floor(index / 9)) return;
          event.preventDefault();
          const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button');
          buttons?.[target]?.focus();
          onChange(options[target].value);
        }}>{short}</button>;
      })}
    </div>
    <small>{options.find(option => option.value === value)?.label ?? 'Elegí un sector'}</small>
  </fieldset>;
}

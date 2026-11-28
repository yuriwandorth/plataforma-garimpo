'use client';
// Escolha de benefícios em cliques: catálogo pronto + itens próprios.
import { useState } from 'react';
import { cx } from './ui';

export interface BenefitOption { name: string; group?: string; hint?: string }

export function BenefitsPicker({ value, onChange, options, placeholder = 'Outro benefício…' }: {
  value: string[]; onChange: (v: string[]) => void; options: BenefitOption[]; placeholder?: string;
}) {
  const [custom, setCustom] = useState('');
  const toggle = (n: string) => onChange(value.includes(n) ? value.filter((x) => x !== n) : [...value, n]);
  const groups = [...new Set(options.map((o) => o.group ?? ''))];
  const extras = value.filter((v) => !options.some((o) => o.name === v));
  function add() {
    const n = custom.trim();
    if (n && !value.includes(n)) onChange([...value, n]);
    setCustom('');
  }
  return (
    <div className="space-y-2">
      {groups.map((g) => (
        <div key={g}>
          {g && <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-mute">{g}</div>}
          <div className="flex flex-wrap gap-1.5">
            {options.filter((o) => (o.group ?? '') === g).map((o) => (
              <button key={o.name} type="button" title={o.hint} onClick={() => toggle(o.name)}
                className={cx('rounded-full border px-2.5 py-1 text-xs', value.includes(o.name) ? 'border-gold bg-gold/15 font-medium text-ink' : 'border-line text-mute hover:border-gold/50 hover:text-ink')}>
                {value.includes(o.name) ? '✓ ' : '+ '}{o.name}
              </button>
            ))}
          </div>
        </div>
      ))}
      {extras.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {extras.map((n) => (
            <button key={n} type="button" onClick={() => toggle(n)} className="rounded-full border border-gold bg-gold/15 px-2.5 py-1 text-xs font-medium" title="Clique para tirar">✓ {n} ×</button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input className="input" value={custom} placeholder={placeholder} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <button type="button" onClick={add} className="rounded-lg border border-line px-3 text-sm hover:border-gold/60">Adicionar</button>
      </div>
    </div>
  );
}

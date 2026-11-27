'use client';
import { MONTHS, nextMonth, prevMonth } from '@/lib/calc';
import { Button } from './ui';

export function MonthPicker({ y, m, onChange }: { y: number; m: number; onChange: (y: number, m: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="outline" aria-label="Mês anterior" onClick={() => { const p = prevMonth(y, m); onChange(p.y, p.m); }}>‹</Button>
      <span className="min-w-[9rem] text-center text-sm font-medium">{MONTHS[m - 1]} {y}</span>
      <Button size="sm" variant="outline" aria-label="Próximo mês" onClick={() => { const n = nextMonth(y, m); onChange(n.y, n.m); }}>›</Button>
    </div>
  );
}

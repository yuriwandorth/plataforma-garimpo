'use client';
import { useMemo } from 'react';
import { useCollection } from './db';
import type { Channel, Client, Member, Plan, Product } from './types';

export function useChannels() {
  const r = useCollection<Channel>('channels');
  const data = useMemo(() => [...r.data].sort((a, b) => a.order - b.order), [r.data]);
  const byId = useMemo(() => Object.fromEntries(data.map((c) => [c.id, c])), [data]);
  return { ...r, data, active: data.filter((c) => c.active), byId };
}

export function useMembers() {
  const r = useCollection<Member>('members');
  const data = useMemo(() => [...r.data].sort((a, b) => a.name.localeCompare(b.name)), [r.data]);
  const byId = useMemo(() => Object.fromEntries(data.map((m) => [m.id, m])), [data]);
  return { ...r, data, sellers: data.filter((m) => m.active && m.isSeller), byId };
}

export function useProducts() {
  const r = useCollection<Product>('products');
  const data = useMemo(() => [...r.data].sort((a, b) => a.createdAt - b.createdAt), [r.data]);
  const byId = useMemo(() => Object.fromEntries(data.map((p) => [p.id, p])), [data]);
  return { ...r, data, byId };
}

export function usePlans() {
  const r = useCollection<Plan>('plans');
  const data = useMemo(() => [...r.data].sort((a, b) => a.name.localeCompare(b.name)), [r.data]);
  const byId = useMemo(() => Object.fromEntries(data.map((p) => [p.id, p])), [data]);
  return { ...r, data, active: data.filter((p) => p.active), byId };
}

export function useClients() {
  const r = useCollection<Client>('clients');
  const data = useMemo(() => [...r.data].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [r.data]);
  const byId = useMemo(() => Object.fromEntries(data.map((c) => [c.id, c])), [data]);
  return { ...r, data, byId };
}

export function download(filename: string, content: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿' + content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function useInfluencers() {
  const r = useCollection<import('./growth').Influencer>('influencers');
  const data = useMemo(() => [...r.data].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [r.data]);
  const byId = useMemo(() => Object.fromEntries(data.map((i) => [i.id, i])), [data]);
  return { ...r, data, closed: data.filter((i) => i.stage === 'fechado' && i.active !== false), byId };
}

// Menu da plataforma e permissões por tela.
export interface NavItem { href: string; label: string; owner?: boolean }
export const NAV: { group: string; items: { href: string; label: string; owner?: boolean }[] }[] = [
  { group: 'Visão', items: [{ href: '/painel/', label: 'Painel' }, { href: '/desempenho/', label: 'Desempenho' }] },
  { group: 'Clientes', items: [
    { href: '/clientes/', label: 'Central de clientes' },
    { href: '/renovacoes/', label: 'Renovações' },
    { href: '/recall/', label: 'Recall de ex-alunas' },
    { href: '/cobrancas/', label: 'Cobranças' },
  ] },
  { group: 'Comercial', items: [
    { href: '/leads/', label: 'Leads' },
    { href: '/origens/', label: 'Origens e links' },
    { href: '/vendas/', label: 'Vendas' },
    { href: '/pedidos/', label: 'Checkout e pedidos' },
    { href: '/metas/', label: 'Metas por canal' },
    { href: '/campanhas/', label: 'Campanhas' },
    { href: '/produtos/', label: 'Produtos e planos' },
    { href: '/ofertas/', label: 'Ofertas' },
    { href: '/influencers/', label: 'Influencers' },
    { href: '/embaixadoras/', label: 'Embaixadoras' },
    { href: '/ranking/', label: 'Ranking do negócio' },
  ] },
  { group: 'Gestão', items: [
    { href: '/okr/', label: 'OKR' },
    { href: '/atividades/', label: 'Atividades' },
    { href: '/conhecimento/', label: 'Base de conhecimento' },
    { href: '/diario/', label: 'Diário', owner: true },
    { href: '/time/', label: 'Time', owner: true },
    { href: '/configuracoes/', label: 'Configurações', owner: true },
  ] },
];

/** Telas que o dono pode liberar ou não para cada pessoa do time */
export const STAFF_PAGES: NavItem[] = NAV.flatMap((g) => g.items).filter((i) => !i.owner);

/** Pode ver a tela? Dono vê tudo; time vê as liberadas (sem lista = todas, menos as do dono) */
export function canSee(path: string, isOwner: boolean, allowed?: string[]): boolean {
  if (isOwner) return true;
  const item = NAV.flatMap((g) => g.items).filter((i) => path.startsWith(i.href)).sort((a, b) => b.href.length - a.href.length)[0];
  if (!item) return true; // páginas fora do menu (ex.: importação tem a própria checagem)
  if (item.owner) return false;
  return !allowed || allowed.includes(item.href);
}

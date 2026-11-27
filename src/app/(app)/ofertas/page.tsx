'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCollection, useWriter } from '@/lib/db';
import { useSession } from '@/lib/auth';
import { fmtBRL } from '@/lib/calc';
import { newOffer, TIERS, TIER_LABEL, type Offer } from '@/lib/offer';
import { Button, Card, Empty, ErrorNote, PageHeader, Spinner } from '@/components/ui';

export default function OfertasPage() {
  const offers = useCollection<Offer>('offers');
  const w = useWriter();
  const { profile } = useSession();
  const router = useRouter();
  const list = [...offers.data].sort((a, b) => b.updatedAt - a.updatedAt);

  async function create() {
    const id = await w.create('offers', newOffer('Nova oferta'), 'Oferta criada');
    router.push(`/ofertas/editar/?id=${id}`);
  }

  return (
    <div>
      <PageHeader title="Ofertas" subtitle="Monte os 4 planos com preços e entregáveis, veja o valor líquido de cada parcela e gere o texto pro WhatsApp."
        actions={<Button onClick={create}>Nova oferta</Button>} />
      <ErrorNote error={offers.error} />
      {offers.loading ? <Spinner /> : list.length === 0 ? (
        <Empty title="Nenhuma oferta ainda" text="Comece pelo anual: ele é a base e os outros planos são calculados a partir dele." action={<Button onClick={create}>Nova oferta</Button>} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((o) => {
            const on = TIERS.filter((t) => o.tiers[t].enabled && o.tiers[t].price > 0);
            return (
              <Card key={o.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{o.name}</h3>
                    <p className="text-xs text-mute">{on.length} de 4 planos · atualizada em {new Date(o.updatedAt).toLocaleDateString('pt-BR')}</p>
                  </div>
                  <div className="flex gap-1">
                    <Link href={`/ofertas/editar/?id=${o.id}`}><Button size="sm" variant="outline">Editar</Button></Link>
                    <Button size="sm" variant="ghost" onClick={() => {
                      const { id, createdAt, updatedAt, ...rest } = o; void id; void createdAt; void updatedAt;
                      w.create('offers', { ...rest, name: `${o.name} (cópia)` }, `Oferta duplicada: ${o.name}`);
                    }}>Duplicar</Button>
                    {profile?.role === 'owner' && (
                      <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Excluir a oferta "${o.name}"?`)) w.hardDelete('offers', o.id, `Oferta excluída: ${o.name}`); }}>Excluir</Button>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {on.map((t) => <span key={t} className="rounded-full bg-line/50 px-2 py-0.5">{TIER_LABEL[t]} {fmtBRL(o.tiers[t].price)}</span>)}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

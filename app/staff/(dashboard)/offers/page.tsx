'use client';

import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, ChevronLeft, ChevronRight, LoaderCircle, XCircle } from 'lucide-react';
import { StaffHeader } from '@/components/staff/StaffHeader';

type Offer = {
  id: string;
  property_id: string;
  amount: number;
  currency: string;
  message: string;
  status: string;
  counter_amount: number | null;
  public_reference: string;
  created_at: string;
  customer: {
    display_name: string | null;
    email: string | null;
    phone: string | null;
  } | Array<{
    display_name: string | null;
    email: string | null;
    phone: string | null;
  }> | null;
};

function customerFor(offer: Offer) {
  return Array.isArray(offer.customer) ? offer.customer[0] : offer.customer;
}

function formatNaira(value: number) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(value);
}

export default function OffersPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [canDecide, setCanDecide] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [counterAmounts, setCounterAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadOffers = useCallback(async () => {
    try {
      const response = await fetch(`/api/offers?page=${page}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load offers');
      setError('');
      setOffers(result.data);
      setCanDecide(result.canDecide === true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load offers');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => (active ? loadOffers() : undefined));
    return () => {
      active = false;
    };
  }, [loadOffers]);

  const decide = async (offer: Offer, status: 'approved' | 'rejected' | 'countered') => {
    const counterAmount = Number(counterAmounts[offer.id]);
    if (status === 'countered' && (!Number.isFinite(counterAmount) || counterAmount <= 0)) {
      setError('Enter a valid counter amount before sending a counter-offer.');
      return;
    }
    setSavingId(offer.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/offers/${offer.id}/decision`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          ...(status === 'countered' ? { counterAmount } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to record the offer decision');
      setNotice(`Offer ${offer.public_reference} marked ${status}.`);
      setLoading(true);
      await loadOffers();
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : 'Unable to record the offer decision');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-warm">
      <StaffHeader breadcrumbs={[{ label: 'Offers' }]} />
      <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Human review required</p>
            <h1 className="font-headline text-2xl font-bold tracking-tight text-charcoal sm:text-3xl">
              Offer review
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-charcoal/70">
              Customer offers are requests, not accepted terms. Only authorized staff can approve, reject, or counter.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void loadOffers();
            }}
            disabled={loading}
            className="nestly-press self-start rounded-full border border-hairline bg-white px-4 py-2 text-xs font-bold text-charcoal disabled:opacity-50 sm:self-auto"
          >
            Refresh queue
          </button>
        </div>

        {error && (
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}
        {notice && (
          <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {notice}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 rounded-3xl border border-hairline bg-white p-8 text-sm text-muted-ink">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Loading offer queue…
          </div>
        ) : offers.length === 0 ? (
          <div className="rounded-3xl border border-hairline bg-white p-8 text-sm text-muted-ink">
            No offers on this page.
          </div>
        ) : (
          <div className="space-y-4">
            {offers.map((offer) => {
              const customer = customerFor(offer);
              const isPending = offer.status === 'pending';
              return (
                <article key={offer.id} className="rounded-3xl border border-hairline bg-white p-5 shadow-sm sm:p-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-soft-stone px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-charcoal">
                          {offer.public_reference}
                        </span>
                        <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
                          isPending ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {offer.status}
                        </span>
                        <span className="text-[11px] text-muted-ink">
                          {new Date(offer.created_at).toLocaleString('en-NG')}
                        </span>
                      </div>
                      <div>
                        <h2 className="font-headline text-lg font-bold text-charcoal">
                          {customer?.display_name || 'Customer'}
                        </h2>
                        <p className="text-xs text-muted-ink">
                          {[customer?.email, customer?.phone].filter(Boolean).join(' · ') || 'No contact details'}
                        </p>
                      </div>
                      <p className="break-all text-xs text-muted-ink">Property {offer.property_id}</p>
                      {offer.message && (
                        <p className="max-w-3xl whitespace-pre-wrap rounded-2xl bg-soft-stone p-3 text-sm text-charcoal/80">
                          {offer.message}
                        </p>
                      )}
                    </div>
                    <div className="min-w-52 rounded-2xl bg-soft-stone p-4 lg:text-right">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-ink">Offer amount</span>
                      <p className="font-headline text-2xl font-bold text-charcoal">{formatNaira(Number(offer.amount))}</p>
                      {offer.counter_amount != null && (
                        <p className="mt-1 text-xs text-muted-ink">
                          Counter {formatNaira(Number(offer.counter_amount))}
                        </p>
                      )}
                    </div>
                  </div>

                  {isPending && canDecide && (
                    <div className="mt-5 flex flex-col gap-3 border-t border-hairline pt-4 sm:flex-row sm:items-end">
                      <label className="flex-1 text-[10px] font-bold uppercase tracking-wider text-muted-ink">
                        Counter amount (NGN)
                        <input
                          type="number"
                          min="1"
                          step="1000"
                          value={counterAmounts[offer.id] ?? ''}
                          onChange={(event) => setCounterAmounts((current) => ({
                            ...current,
                            [offer.id]: event.target.value,
                          }))}
                          className="mt-1 block w-full rounded-xl border border-hairline bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-charcoal outline-none focus:border-primary"
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void decide(offer, 'approved')}
                          disabled={savingId !== null}
                          className="nestly-press inline-flex items-center justify-center min-h-[36px] gap-1.5 rounded-full bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white shrink-0 disabled:opacity-50"
                        >
                          <BadgeCheck className="h-4 w-4" /> Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => void decide(offer, 'countered')}
                          disabled={savingId !== null}
                          className="nestly-press inline-flex items-center justify-center min-h-[36px] rounded-full border border-hairline bg-soft-stone px-4 py-2.5 text-xs font-bold text-charcoal shrink-0 disabled:opacity-50"
                        >
                          Counter
                        </button>
                        <button
                          type="button"
                          onClick={() => void decide(offer, 'rejected')}
                          disabled={savingId !== null}
                          className="nestly-press inline-flex items-center justify-center min-h-[36px] gap-1.5 rounded-full border border-red-200 bg-white px-4 py-2.5 text-xs font-bold text-red-700 shrink-0 disabled:opacity-50"
                        >
                          <XCircle className="h-4 w-4" /> Reject
                        </button>
                      </div>
                      {savingId === offer.id && <span className="text-xs text-muted-ink">Saving…</span>}
                    </div>
                  )}
                  {isPending && !canDecide && (
                    <p className="mt-4 border-t border-hairline pt-4 text-xs text-muted-ink">
                      You can review this offer, but your role cannot decide it.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page === 1 || loading}
            aria-label="Previous page"
            className="w-9 h-9 flex items-center justify-center rounded-full border border-hairline bg-white text-charcoal shrink-0 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs font-semibold text-muted-ink">Page {page}</span>
          <button
            type="button"
            onClick={() => setPage((current) => current + 1)}
            disabled={loading || offers.length < 100}
            aria-label="Next page"
            className="w-9 h-9 flex items-center justify-center rounded-full border border-hairline bg-white text-charcoal shrink-0 disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </main>
    </div>
  );
}

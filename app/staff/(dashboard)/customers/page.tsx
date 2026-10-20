'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { StaffHeader } from '@/components/staff/StaffHeader';
import { MOTION, prefersReducedMotion } from '@/lib/motion';
import { customerName, staffDate, type StaffCustomer } from '@/lib/staff-customers';

export default function CustomerDirectoryPage() {
  const [customers, setCustomers] = useState<StaffCustomer[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const tableBodyRef = useRef<HTMLTableSectionElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page), search });
        const response = await fetch(`/api/staff/customers?${params}`, { cache: 'no-store', signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to load customers');
        if (!controller.signal.aborted) { setCustomers(result.data); setTotal(result.total); setError(''); }
      } catch (error) {
        if (!controller.signal.aborted) { setCustomers([]); setError(error instanceof Error ? error.message : 'Unable to load customers'); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [search, page, retry]);
  useGSAP(() => {
    if (prefersReducedMotion() || !tableBodyRef.current) return;
    gsap.fromTo(tableBodyRef.current.querySelectorAll('tr'), { y: 6, opacity: 0 }, {
      y: 0, opacity: 1, duration: 0.18, stagger: 0.022, ease: MOTION.ease.crispOut, clearProps: 'transform,opacity',
    });
  }, { dependencies: [customers] });
  return <div className="flex-1 min-h-screen bg-warm">
    <StaffHeader breadcrumbs={[{ label: 'Customer Directory' }]} />
    <main className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      <div><h1 className="font-headline text-2xl sm:text-3xl font-bold text-charcoal">Customer Directory</h1>
        <p className="text-sm text-muted-ink mt-2">Customer records and activity visible to your staff role. Times are shown in WAT.</p></div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="text-xs font-bold flex flex-col gap-2 w-full sm:max-w-md">Search customers
          <input type="search" value={search} maxLength={120} onChange={event => { setSearch(event.target.value); setPage(1); }}
            placeholder="Name, email or phone" className="rounded-full border border-hairline bg-white px-4 py-3 text-sm font-normal" />
        </label>
        <button type="button" onClick={() => setRetry(value => value + 1)} disabled={loading} className="shrink-0 rounded-full border border-hairline bg-white px-4 py-2 text-xs font-bold disabled:opacity-40">Refresh customers</button>
      </div>
      {error && <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
      {loading ? <p role="status">Loading customers…</p> : !error && <>
        <div className="rounded-3xl border border-hairline bg-white overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm"><caption className="p-4 text-left text-xs text-muted-ink">{total} matching records in your authorized scope</caption>
            <thead className="bg-soft-stone text-xs"><tr><th className="p-4">Customer</th><th className="p-4">Contact details</th><th className="p-4">Updated (WAT)</th><th className="p-4">Profile</th></tr></thead>
            <tbody ref={tableBodyRef}>{customers.map(customer => <tr key={customer.id} className="border-t border-hairline">
              <td className="p-4 font-semibold">{customerName(customer)}</td><td className="p-4"><p>{customer.email || 'Email not provided'}</p><p className="text-xs text-muted-ink mt-1">{customer.phone || 'Phone not provided'}</p></td>
              <td className="p-4 text-xs">{staffDate(customer.updated_at)}</td><td className="p-4"><Link href={`/staff/customers/${customer.id}`} className="inline-flex whitespace-nowrap rounded-full border border-hairline px-3 py-2 text-xs font-bold hover:bg-soft-stone">View profile</Link></td>
            </tr>)}</tbody>
          </table>{!customers.length && <p className="p-8 text-sm text-muted-ink">No matching customer records.</p>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs"><span>Page {page} of {Math.max(1, Math.ceil(total / 25))}</span><div className="flex gap-2">
          <button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)} className="shrink-0 rounded-full border border-hairline px-4 py-2 font-bold disabled:opacity-40">Previous</button>
          <button type="button" disabled={page * 25 >= total} onClick={() => setPage(value => value + 1)} className="shrink-0 rounded-full border border-hairline px-4 py-2 font-bold disabled:opacity-40">Next</button>
        </div></div>
      </>}
    </main>
  </div>;
}

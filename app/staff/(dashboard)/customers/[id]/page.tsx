'use client';

import React, { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { StaffHeader } from '@/components/staff/StaffHeader';
import { MOTION, prefersReducedMotion } from '@/lib/motion';
import { customerName, staffDate, type StaffCustomerDetail } from '@/lib/staff-customers';

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<StaffCustomerDetail | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const activityRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/staff/customers/${encodeURIComponent(id)}`, { cache: 'no-store', signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to load customer');
        if (!controller.signal.aborted) { setData(result.data); setError(''); }
      } catch (error) {
        if (!controller.signal.aborted) { setData(null); setError(error instanceof Error ? error.message : 'Unable to load customer'); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [id, retry]);
  useGSAP(() => {
    if (!activityRef.current || prefersReducedMotion()) return;
    gsap.fromTo(activityRef.current.querySelectorAll('[data-customer-section]'), { y: 6, opacity: 0 }, { y: 0, opacity: 1, duration: 0.18, stagger: 0.025, ease: MOTION.ease.crispOut, clearProps: 'transform,opacity' });
  }, { dependencies: [data] });
  const sectionClass = 'rounded-3xl border border-hairline bg-white p-5 sm:p-6 space-y-4';
  return <div className="flex-1 min-h-screen bg-warm">
    <StaffHeader breadcrumbs={[{ label: 'Customer Directory', href: '/staff/customers' }, { label: data ? customerName(data.customer) : 'Customer profile' }]} />
    <main className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap justify-between gap-3"><Link href="/staff/customers" className="text-xs font-bold underline">Back to directory</Link>
        <button type="button" disabled={loading} onClick={() => setRetry(value => value + 1)} className="shrink-0 rounded-full border border-hairline px-4 py-2 text-xs font-bold disabled:opacity-40">Refresh profile</button></div>
      {loading && <p role="status">Loading customer profile…</p>}
      {error && <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
      {!loading && !error && data && <>
        <section className={sectionClass}><h1 className="font-headline text-2xl font-bold">{customerName(data.customer)}</h1>
          <dl className="grid sm:grid-cols-2 gap-4 text-sm"><div><dt className="text-xs text-muted-ink">Email</dt><dd className="break-all">{data.customer.email || 'Not provided'}</dd></div><div><dt className="text-xs text-muted-ink">Phone</dt><dd>{data.customer.phone || 'Not provided'}</dd></div>
            <div><dt className="text-xs text-muted-ink">Created (WAT)</dt><dd>{staffDate(data.customer.created_at)}</dd></div><div><dt className="text-xs text-muted-ink">Last record update (WAT)</dt><dd>{staffDate(data.customer.updated_at)}</dd></div></dl>
        </section>
        <div ref={activityRef} className="grid lg:grid-cols-2 gap-6">
          <section data-customer-section className={sectionClass}><h2 className="font-bold">Conversations ({data.conversationCount})</h2>
            <p className="text-xs text-muted-ink">Open a conversation to read messages and authorized staff notes.</p>
            {data.conversations.map(item => <Link key={item.id} href={`/staff/inbox/${item.id}`} className="block rounded-2xl border border-hairline p-3 text-sm hover:bg-soft-stone"><span className="font-bold capitalize">{item.channel}</span> · {item.mode.replaceAll('_', ' ')}<span className="block text-xs text-muted-ink mt-1">{staffDate(item.updated_at)} WAT</span></Link>)}
            {!data.conversations.length && <p className="text-sm text-muted-ink">No visible conversations.</p>}
          </section>
          <section data-customer-section className={sectionClass}><h2 className="font-bold">Inspections ({data.inspectionCount})</h2>
            {data.inspections.map(item => <Link key={item.id} href={`/staff/inspections/${item.id}`} className="block rounded-2xl border border-hairline p-3 text-sm hover:bg-soft-stone">{item.status.replaceAll('_', ' ')}<span className="block text-xs text-muted-ink mt-1">Requested {staffDate(item.created_at)} WAT</span></Link>)}
            {!data.inspections.length && <p className="text-sm text-muted-ink">No visible inspection requests.</p>}
          </section>
          <section data-customer-section className={sectionClass}><h2 className="font-bold">Contact enquiries ({data.enquiryCount})</h2>
            {data.enquiries.map(item => <article key={item.id} className="rounded-2xl border border-hairline p-3 text-sm"><p className="text-xs text-muted-ink">{item.status} · {staffDate(item.created_at)} WAT</p><p className="mt-2 whitespace-pre-wrap break-words">{item.message}</p></article>)}
            {!data.enquiries.length && <p className="text-sm text-muted-ink">No visible enquiries.</p>}
          </section>
          <section data-customer-section className={sectionClass}><h2 className="font-bold">Landlord submissions ({data.submissionCount})</h2>
            {data.submissions.map(item => <article key={item.id} className="rounded-2xl border border-hairline p-3 text-sm"><h3 className="font-bold">{item.property_type} · {item.city}, {item.state}</h3><p className="text-xs text-muted-ink mt-1">{item.status} · {staffDate(item.created_at)} WAT</p></article>)}
            {!data.submissions.length && <p className="text-sm text-muted-ink">No visible landlord submissions.</p>}
          </section>
        </div><p className="text-xs text-muted-ink">Each activity section shows up to 20 recent records within your permissions. No identity-verification result is inferred from a customer record.</p>
      </>}
    </main>
  </div>;
}

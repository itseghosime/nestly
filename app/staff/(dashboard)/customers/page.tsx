'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { StaffHeader } from '@/components/staff/StaffHeader';
import { CUSTOMERS } from '@/lib/fixtures/customers';
import { MOTION, prefersReducedMotion } from '@/lib/motion';
import {
  Users,
  Search,
  ShieldCheck,
  MessageSquare,
  ChevronRight,
  UserCheck,
  Eye,
} from 'lucide-react';

export default function CustomerDirectoryPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState('ALL');
  const [statusFilter] = useState('ALL');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(CUSTOMERS[0].id);
  const [isSimulatingEmpty, setIsSimulatingEmpty] = useState(false);
  const tableBodyRef = useRef<HTMLTableSectionElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const filteredCustomers = isSimulatingEmpty
    ? []
    : CUSTOMERS.filter((cust) => {
        const matchesSearch =
          cust.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          cust.phone.includes(searchQuery) ||
          cust.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
          cust.preferredNeighborhoods.some((n) => n.toLowerCase().includes(searchQuery.toLowerCase()));

        const matchesLocation =
          locationFilter === 'ALL' ||
          (locationFilter === 'BENIN' && cust.city.toLowerCase().includes('benin')) ||
          (locationFilter === 'SAPELE' && (cust.city.toLowerCase().includes('sapele') || cust.state.toLowerCase().includes('delta')));

        const matchesStatus =
          statusFilter === 'ALL' ||
          (statusFilter === 'SCHEDULED' && cust.status === 'Inspection Scheduled') ||
          (statusFilter === 'ACTIVE' && cust.status === 'Active Seeker');

        return matchesSearch && matchesLocation && matchesStatus;
      });

  const selectedCustomer =
    CUSTOMERS.find((c) => c.id === selectedCustomerId) || CUSTOMERS[0];

  useGSAP(
    () => {
      if (prefersReducedMotion() || !tableBodyRef.current) return;
      const rows = tableBodyRef.current.querySelectorAll('tr');
      if (!rows.length) return;
      gsap.fromTo(
        rows,
        { y: 6, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.18, stagger: 0.022, ease: MOTION.ease.crispOut, overwrite: 'auto', clearProps: 'transform,opacity' }
      );
    },
    { dependencies: [searchQuery, locationFilter, isSimulatingEmpty], scope: tableBodyRef }
  );

  useGSAP(
    () => {
      if (prefersReducedMotion() || !previewRef.current) return;
      gsap.fromTo(
        previewRef.current,
        { y: 6, opacity: 0.9 },
        { y: 0, opacity: 1, duration: 0.18, ease: MOTION.ease.crispOut, clearProps: 'transform,opacity' }
      );
    },
    { dependencies: [selectedCustomerId] }
  );

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-warm">
      <StaffHeader
        breadcrumbs={[{ label: 'Customer Directory' }]}
        actions={
          <button
            type="button"
            onClick={() => setIsSimulatingEmpty(!isSimulatingEmpty)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-soft-stone hover:bg-hairline text-charcoal text-xs font-semibold transition-colors border border-hairline shadow-2xs"
          >
            <Eye className="w-3.5 h-3.5 text-muted-ink" />
            <span>{isSimulatingEmpty ? 'Show Active Directory' : 'Simulate Empty Search'}</span>
          </button>
        }
      />

      <div className="p-4 sm:p-8 max-w-7xl mx-auto w-full space-y-6">
        {/* Header Block */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <h1 className="font-headline text-2xl sm:text-3xl font-bold text-charcoal tracking-tight">
              Customer Directory
            </h1>
            <p className="text-sm text-charcoal/70 mt-1">
              Customer records established through explicit WhatsApp inquiries and inspection submissions.
            </p>
          </div>
        </div>

        {/* Privacy Governance Card */}
        <div className="rounded-3xl p-5 sm:p-6 bg-white shadow-sm border border-hairline relative overflow-hidden">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-soft-stone text-primary flex items-center justify-center shrink-0 border border-hairline">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-charcoal">
                Privacy Governance Rule (NDPA 2023 Compliance)
              </h2>
              <p className="text-xs text-charcoal/80 leading-relaxed max-w-3xl">
                Anonymous browser <strong className="text-charcoal font-semibold">Saved Homes</strong> are stored locally on prospective tenants&apos; personal devices and are <span className="text-persimmon font-bold">NEVER</span> attributed to named customer records. Only explicitly submitted inspection inquiries and direct WhatsApp messages appear in this directory.
              </p>
            </div>
          </div>
        </div>

        {/* Search & Filter Controls */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 shadow-sm border border-hairline space-y-3">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-muted-ink absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by customer name, phone, or neighborhood..."
                className="w-full pl-11 pr-4 py-2.5 bg-warm rounded-full text-xs text-charcoal placeholder:text-muted-ink/60 border border-hairline focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-ink hover:text-charcoal text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Quick Filter Chips */}
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setLocationFilter('ALL')}
                className={`px-3.5 py-1.5 rounded-full transition-all ${
                  locationFilter === 'ALL'
                    ? 'bg-charcoal text-white font-bold'
                    : 'bg-soft-stone text-charcoal/70 hover:bg-hairline'
                }`}
              >
                All Corridors ({CUSTOMERS.length})
              </button>
              <button
                type="button"
                onClick={() => setLocationFilter('BENIN')}
                className={`px-3.5 py-1.5 rounded-full transition-all ${
                  locationFilter === 'BENIN'
                    ? 'bg-primary text-white font-bold'
                    : 'bg-soft-stone text-charcoal/70 hover:bg-hairline'
                }`}
              >
                Benin City
              </button>
              <button
                type="button"
                onClick={() => setLocationFilter('SAPELE')}
                className={`px-3.5 py-1.5 rounded-full transition-all ${
                  locationFilter === 'SAPELE'
                    ? 'bg-primary text-white font-bold'
                    : 'bg-soft-stone text-charcoal/70 hover:bg-hairline'
                }`}
              >
                Sapele / Delta
              </button>
            </div>
          </div>
        </div>

        {/* Main Work Area: Table Grid & Detail Drawer Preview */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
          {/* Table Container */}
          <div className="xl:col-span-8 bg-white rounded-3xl shadow-sm border border-hairline overflow-hidden">
            <div className="px-6 py-4 bg-soft-stone/70 border-b border-hairline flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-headline text-sm font-bold text-charcoal">Verified Contacts</span>
                <span className="px-2 py-0.5 rounded-full bg-white text-muted-ink text-[11px] font-bold border border-hairline">
                  {filteredCustomers.length} Records
                </span>
              </div>
              <span className="text-[11px] text-muted-ink">WAT Africa/Lagos</span>
            </div>

            {filteredCustomers.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <Users className="w-10 h-10 text-muted-ink mx-auto" />
                <h3 className="font-headline text-base font-bold text-charcoal">No Customer Records Found</h3>
                <p className="text-xs text-charcoal/70 max-w-sm mx-auto">
                  No records match your active search filter. Clear your query or exit empty simulation.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-warm/60 text-muted-ink uppercase font-bold text-[10px] tracking-wider border-b border-hairline">
                      <th className="py-3 px-4 whitespace-nowrap">Customer Name</th>
                      <th className="py-3 px-2.5">Contact</th>
                      <th className="py-3 px-2.5">Preferred Zone</th>
                      <th className="py-3 px-2.5">Status</th>
                      <th className="py-3 px-2.5">KYC Vetting</th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">Action</th>
                    </tr>
                  </thead>
                  <tbody ref={tableBodyRef} className="divide-y divide-hairline">
                    {filteredCustomers.map((cust) => {
                      const isSelected = selectedCustomerId === cust.id;

                      return (
                        <tr
                          key={cust.id}
                          onClick={() => setSelectedCustomerId(cust.id)}
                          className={`hover:bg-soft-stone/50 transition-colors cursor-pointer ${
                            isSelected ? 'bg-soft-stone/70 font-medium' : ''
                          }`}
                        >
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-soft-stone text-primary font-bold flex items-center justify-center text-xs shrink-0 border border-hairline">
                                {cust.name
                                  .split(' ')
                                  .map((n) => n[0])
                                  .join('')
                                  .slice(0, 2)}
                              </div>
                              <div>
                                <span className="font-bold text-charcoal block">{cust.name}</span>
                                <span className="text-[10px] text-muted-ink">{cust.city}, {cust.state}</span>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-2.5 font-mono text-[11px] text-charcoal/80 leading-tight">
                            {cust.phone}
                          </td>
                          <td className="py-3 px-2.5 text-charcoal/80">
                            <span className="truncate max-w-[130px] block" title={cust.preferredNeighborhoods.join(', ')}>
                              {cust.preferredNeighborhoods.join(', ')}
                            </span>
                          </td>
                          <td className="py-3 px-2.5">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                cust.status === 'Inspection Scheduled'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {cust.status}
                            </span>
                          </td>
                          <td className="py-3 px-2.5 text-[11px] text-emerald-700 font-semibold">
                            <span className="inline-flex items-center gap-1">
                              <UserCheck className="w-3.5 h-3.5 shrink-0" />
                              <span>{cust.kycStatus}</span>
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <Link
                              href={`/staff/customers/${cust.id}`}
                              className="px-3.5 py-1.5 rounded-full bg-white hover:bg-persimmon hover:text-white text-charcoal font-bold text-xs transition-all border border-hairline shadow-2xs whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 nestly-press"
                            >
                              Detail &rarr;
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Right Column: Customer Card Fast Preview */}
          <div ref={previewRef} className="xl:col-span-4 bg-white rounded-3xl p-6 shadow-sm border border-hairline space-y-5 sticky top-24">
            <div className="flex items-start justify-between pb-3 border-b border-hairline">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-ink">
                  Customer Summary
                </span>
                <h3 className="font-headline text-base font-bold text-charcoal mt-0.5">
                  {selectedCustomer.name}
                </h3>
                <p className="text-xs text-muted-ink">{selectedCustomer.email}</p>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                {selectedCustomer.kycStatus}
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-2xl bg-soft-stone border border-hairline space-y-1">
                <span className="text-[10px] font-bold uppercase text-muted-ink">Search Parameters</span>
                <p className="font-bold text-charcoal">{selectedCustomer.budgetRange}</p>
                <p className="text-charcoal/70 text-[11px]">
                  Zones: {selectedCustomer.preferredNeighborhoods.join(' • ')}
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-soft-stone border border-hairline space-y-1">
                <span className="text-[10px] font-bold uppercase text-muted-ink">Coordinator Notes</span>
                <p className="text-charcoal/80 leading-relaxed text-[11px]">
                  &quot;{selectedCustomer.notes}&quot;
                </p>
              </div>

              <div className="flex justify-between items-center text-charcoal/70 pt-1 text-xs">
                <span>Total Inspections:</span>
                <span className="font-bold text-charcoal">{selectedCustomer.totalInspections} Scheduled</span>
              </div>
              <div className="flex justify-between items-center text-charcoal/70 text-xs">
                <span>Last Active:</span>
                <span className="font-semibold text-charcoal">{selectedCustomer.lastActive}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-hairline space-y-2">
              <Link
                href={`/staff/customers/${selectedCustomer.id}`}
                className="w-full py-3 px-4 rounded-full bg-persimmon hover:bg-persimmon-hover text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-xs"
              >
                <span>View Full Customer Profile</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/staff/inbox/conv-01"
                className="w-full py-2.5 px-4 rounded-full bg-soft-stone hover:bg-hairline text-charcoal text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border border-hairline"
              >
                <MessageSquare className="w-3.5 h-3.5 text-persimmon" />
                <span>Open WhatsApp Triage Thread</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

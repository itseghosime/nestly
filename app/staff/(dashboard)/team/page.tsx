'use client';

import React, { useCallback, useEffect, useState, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { MOTION, prefersReducedMotion } from '@/lib/motion';
import { StaffHeader } from '@/components/staff/StaffHeader';
import { isStaffRole, type StaffRole } from '@/lib/backend/authorization';
import {
  Shield,
  Users,
  UserCheck,
  CheckCircle2,
  Search,
  MapPin,
  Clock,
} from 'lucide-react';

interface TeamMember {
  id: string;
  displayName: string;
  role: StaffRole;
  assignedZone: string | null;
}

function isTeamMember(value: unknown): value is TeamMember {
  return Boolean(
    value
    && typeof value === 'object'
    && 'id' in value
    && typeof value.id === 'string'
    && 'displayName' in value
    && typeof value.displayName === 'string'
    && 'role' in value
    && isStaffRole(value.role)
    && 'assignedZone' in value
    && (value.assignedZone === null || typeof value.assignedZone === 'string'),
  );
}

async function fetchTeamMembers(): Promise<TeamMember[]> {
  const response = await fetch('/api/staff/team', { cache: 'no-store' });
  const result: unknown = await response.json().catch(() => null);
  if (
    !response.ok
    || !result
    || typeof result !== 'object'
    || !('data' in result)
    || !Array.isArray(result.data)
  ) {
    const message = result && typeof result === 'object' && 'error' in result
      && typeof result.error === 'string'
      ? result.error
      : 'Unable to load staff profiles';
    throw new Error(message);
  }
  const members: TeamMember[] = result.data.map((member: unknown) => {
    if (!isTeamMember(member)) throw new Error('Staff profile data is invalid');
    return member;
  });
  return members;
}

export default function TeamAndRolesPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [rosterError, setRosterError] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<'Field Vetting Agent' | 'Operations Lead' | 'Legal & Compliance'>('Field Vetting Agent');
  const [inviteZone, setInviteZone] = useState('GRA Benin & Boundary Road');
  const [inviteSent, setInviteSent] = useState(false);
  const [invitePending, setInvitePending] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const tableBodyRef = useRef<HTMLTableSectionElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);

  const loadMembers = useCallback(async () => {
    setRosterLoading(true);
    try {
      setMembers(await fetchTeamMembers());
      setRosterError('');
    } catch (loadError) {
      setRosterError(loadError instanceof Error ? loadError.message : 'Unable to load staff profiles');
    } finally {
      setRosterLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetchTeamMembers()
      .then((teamMembers) => {
        if (active) {
          setMembers(teamMembers);
          setRosterError('');
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setRosterError(loadError instanceof Error ? loadError.message : 'Unable to load staff profiles');
        }
      })
      .finally(() => {
        if (active) setRosterLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useGSAP(() => {
    if (prefersReducedMotion() || !tableBodyRef.current) return;
    const rows = tableBodyRef.current.querySelectorAll('tr');
    const last = rows[rows.length - 1];
    if (last) gsap.fromTo(last, { y: 6, opacity: 0 }, { y: 0, opacity: 1, duration: 0.18, ease: MOTION.ease.crispOut, clearProps: 'transform,opacity' });
  }, { dependencies: [members.length] });
  useGSAP(() => {
    if (prefersReducedMotion() || !tableBodyRef.current) return;
    const rows = tableBodyRef.current.querySelectorAll('tr');
    if (!rows.length) return;
    gsap.fromTo(rows, { y: 6, opacity: 0 }, { y: 0, opacity: 1, duration: 0.16, stagger: 0.02, ease: MOTION.ease.crispOut, overwrite: 'auto', clearProps: 'transform,opacity' });
  }, { dependencies: [roleFilter, searchQuery], scope: tableBodyRef });
  useGSAP(() => {
    if (!inviteSent || !toastRef.current || prefersReducedMotion()) return;
    gsap.fromTo(toastRef.current, { y: -6, opacity: 0 }, { y: 0, opacity: 1, duration: 0.2, ease: MOTION.ease.crispOut, clearProps: 'transform,opacity' });
  }, { dependencies: [inviteSent] });

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInvitePending(true);
    setInviteError('');
    setInviteMessage('');
    setInviteSent(false);
    try {
    const response = await fetch('/api/auth/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: inviteEmail.trim(),
        display_name: inviteName.trim(),
        role: inviteRole,
        assigned_zone: inviteZone,
      }),
    });
    const result: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = result && typeof result === 'object' && 'error' in result
        && typeof result.error === 'string'
        ? result.error
        : 'Unable to create the staff invitation';
      throw new Error(message);
    }
    setInviteSent(true);
    setInviteMessage('Auth invitation created. Email delivery depends on the configured Supabase Auth provider.');
    setInviteEmail('');
    setInviteName('');
    await loadMembers();
    } catch (inviteFailure) {
    setInviteError(inviteFailure instanceof Error ? inviteFailure.message : 'Unable to create the staff invitation');
    } finally {
    setInvitePending(false);
    }
  };

  const filteredMembers = members.filter((m) => {
    const matchesSearch =
    m.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (m.assignedZone ?? '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRole =
      roleFilter === 'ALL' ||
      (roleFilter === 'ADMIN' && (m.role === 'Operations Lead' || m.role === 'Platform Admin')) ||
      (roleFilter === 'FIELD' && m.role === 'Field Vetting Agent') ||
      (roleFilter === 'LEGAL' && m.role === 'Legal & Compliance');

    return matchesSearch && matchesRole;
  });

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-warm">
      <StaffHeader
        breadcrumbs={[{ label: 'Team & Roles' }]}
        actions={
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-soft-stone text-charcoal text-xs font-semibold border border-hairline">
              WAT Governance Tier
            </span>
          </div>
        }
      />

      <div className="p-4 sm:p-8 max-w-7xl mx-auto w-full space-y-6">
        {/* Header Block */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-primary font-bold px-2.5 py-0.5 rounded-full bg-soft-stone border border-hairline">
                Workspace Governance
              </span>
              <span className="text-xs text-muted-ink">Nestly Operations Desk</span>
            </div>
            <h1 className="font-headline text-2xl sm:text-3xl font-bold text-charcoal tracking-tight">
              Team & Roles
            </h1>
            <p className="text-sm text-charcoal/70 max-w-2xl">
              Manage workspace collaborators, operational role hierarchy, and pending field onboarding invitations.
            </p>
          </div>
        </div>

        {/* 4 Metric Bento Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-3xl bg-white shadow-sm border border-hairline">
            <div className="flex items-center justify-between text-muted-ink mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider">Total Collaborators</span>
              <Users className="w-4 h-4" />
            </div>
            <span className="font-headline text-3xl font-bold text-charcoal">{members.length}</span>
            <p className="text-xs text-muted-ink font-semibold mt-1">
              {rosterLoading ? 'Loading authorized roster' : 'Visible within your staff-management scope'}
            </p>
          </div>

          <div className="p-5 rounded-3xl bg-white shadow-sm border border-hairline">
            <div className="flex items-center justify-between text-muted-ink mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider">Field Officers</span>
              <UserCheck className="w-4 h-4 text-emerald-600" />
            </div>
            <span className="font-headline text-3xl font-bold text-charcoal">
              {members.filter((member) => member.role === 'Field Vetting Agent').length}
            </span>
            <p className="text-xs text-muted-ink mt-1">Provisioned profiles in your authorized scope</p>
          </div>

          <div className="p-5 rounded-3xl bg-white shadow-sm border border-hairline">
            <div className="flex items-center justify-between text-muted-ink mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider">Listing Stewards</span>
              <Shield className="w-4 h-4 text-primary" />
            </div>
            <span className="font-headline text-3xl font-bold text-charcoal">
              {members.filter((member) => member.role === 'Legal & Compliance').length}
            </span>
            <p className="text-xs text-muted-ink mt-1">Legal &amp; Compliance profiles</p>
          </div>

          <div className="p-5 rounded-3xl bg-white shadow-sm border border-hairline">
            <div className="flex items-center justify-between text-muted-ink mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider">Pending Invites</span>
              <Clock className="w-4 h-4 text-persimmon" />
            </div>
            <span className="font-headline text-3xl font-bold text-persimmon">—</span>
            <p className="text-xs text-muted-ink mt-1">Invitation delivery state is not tracked</p>
          </div>
        </div>

        {/* Main Grid: Roster Table (8 cols) + Invite Panel (4 cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left: Team Roster Table */}
          <div className="lg:col-span-8 bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-hairline space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
              {/* Filter tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setRoleFilter('ALL')}
                  className={`px-3.5 py-1.5 rounded-full transition-all ${
                    roleFilter === 'ALL'
                      ? 'bg-charcoal text-white font-bold'
                      : 'bg-soft-stone text-charcoal/70 hover:bg-hairline'
                  }`}
                >
                  All ({members.length})
                </button>
                <button
                  type="button"
                  onClick={() => setRoleFilter('ADMIN')}
                  className={`px-3.5 py-1.5 rounded-full transition-all ${
                    roleFilter === 'ADMIN'
                      ? 'bg-primary text-white font-bold'
                      : 'bg-soft-stone text-charcoal/70 hover:bg-hairline'
                  }`}
                >
                  Operations Lead
                </button>
                <button
                  type="button"
                  onClick={() => setRoleFilter('FIELD')}
                  className={`px-3.5 py-1.5 rounded-full transition-all ${
                    roleFilter === 'FIELD'
                      ? 'bg-emerald-700 text-white font-bold'
                      : 'bg-soft-stone text-charcoal/70 hover:bg-hairline'
                  }`}
                >
                  Field Agents
                </button>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-muted-ink absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search team..."
                  className="pl-8 pr-3 py-1.5 bg-warm rounded-full text-xs text-charcoal border border-hairline focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div className="overflow-x-auto -mx-5 sm:-mx-6">
              <table className="w-full text-left text-xs min-w-[620px]">
                <thead>
                  <tr className="bg-soft-stone/70 text-muted-ink uppercase font-bold text-[10px] tracking-wider border-y border-hairline">
                    <th className="py-3 px-6">Collaborator</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Jurisdiction Zone</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody ref={tableBodyRef} className="divide-y divide-hairline">
                  {filteredMembers.map((m) => (
                    <tr key={m.id} className="hover:bg-soft-stone/40 transition-colors">
                      <td className="py-3.5 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-soft-stone text-primary font-bold flex items-center justify-center text-xs shrink-0 border border-hairline">
                            {m.displayName.slice(0, 2).toUpperCase() || 'ST'}
                          </div>
                          <div>
                            <span className="font-bold text-charcoal block">{m.displayName}</span>
                            <span className="text-[11px] text-muted-ink">Profile {m.id.slice(0, 8)}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-charcoal">
                        {m.role}
                      </td>
                      <td className="py-3.5 px-4 text-charcoal/70">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-persimmon shrink-0" />
                          <span>{m.assignedZone || 'No zone assigned'}</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          Profile provisioned
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!rosterLoading && !rosterError && filteredMembers.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-sm text-muted-ink">
                        No staff profiles match this view.
                      </td>
                    </tr>
                  )}
                  {rosterLoading && (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-sm text-muted-ink">
                        Loading authorized staff profiles…
                      </td>
                    </tr>
                  )}
                  {rosterError && (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-sm text-rose-700">
                        {rosterError}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right: Fast Invite Engine */}
          <div className="lg:col-span-4 bg-white rounded-3xl p-6 shadow-sm border border-hairline space-y-4 sticky top-24">
            <div className="pb-3 border-b border-hairline">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-ink">
                Administrative Provisioning
              </span>
              <h3 className="font-headline text-base font-bold text-charcoal mt-0.5">
                Invite Team Member
              </h3>
            </div>

            <form onSubmit={handleSendInvite} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-charcoal mb-1">Display Name</label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="Staff member name"
                  className="w-full bg-warm rounded-full px-4 py-2.5 border border-hairline text-charcoal"
                />
              </div>
              <div>
                <label className="block font-bold text-charcoal mb-1">Work Email</label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="agent.name@nestly.ng"
                  className="w-full bg-warm rounded-full px-4 py-2.5 border border-hairline text-charcoal"
                />
              </div>

              <div>
                <label className="block font-bold text-charcoal mb-1">Assigned Operational Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as 'Field Vetting Agent' | 'Operations Lead' | 'Legal & Compliance')}
                  className="w-full bg-warm rounded-full px-4 py-2.5 border border-hairline text-charcoal"
                >
                  <option value="Field Vetting Agent">Field Vetting Agent</option>
                  <option value="Operations Lead">Operations Lead</option>
                  <option value="Legal & Compliance">Legal & Compliance</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-charcoal mb-1">Assigned Corridor</label>
                <select
                  value={inviteZone}
                  onChange={(e) => setInviteZone(e.target.value)}
                  className="w-full bg-warm rounded-full px-4 py-2.5 border border-hairline text-charcoal"
                >
                  <option>GRA Benin & Boundary Road</option>
                  <option>Airport Road & Ugbor</option>
                  <option>Delta Sector (Sapele / Effurun)</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={invitePending}
                className="w-full py-3 px-4 rounded-full bg-persimmon hover:bg-persimmon-hover text-white font-bold transition-all shadow-xs"
              >
                {invitePending ? 'Creating Invitation…' : 'Dispatch Staff Invitation'}
              </button>
            </form>

            {inviteSent && (
              <div ref={toastRef} className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>{inviteMessage}</span>
              </div>
            )}
            {inviteError && (
              <p role="alert" className="text-xs text-rose-700">{inviteError}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export interface StaffMember {
  id: string;
  name: string;
  role: 'Platform Admin' | 'Operations Lead' | 'Field Vetting Agent' | 'Legal & Compliance' | 'Customer Care';
  email: string;
  phone: string;
  location: string;
  status: 'Active' | 'On Site' | 'Offline';
  assignedZone: string;
  avatar: string;
}

export const STAFF_MEMBERS: StaffMember[] = [
  {
    id: 'staff-01',
    name: 'Demo Staff 01',
    role: 'Field Vetting Agent',
    email: 'demo-contact@example.invalid',
    phone: '+2340000000000',
    location: 'Benin City, Edo',
    status: 'On Site',
    assignedZone: 'GRA Benin & Boundary Road',
    avatar: 'OI',
  },
  {
    id: 'staff-02',
    name: 'Demo Staff 04',
    role: 'Operations Lead',
    email: 'demo-contact@example.invalid',
    phone: '+2340000000000',
    location: 'Benin City, Edo',
    status: 'Active',
    assignedZone: 'Edo State Central Hub',
    avatar: 'VN',
  },
  {
    id: 'staff-03',
    name: 'Demo Staff 07',
    role: 'Field Vetting Agent',
    email: 'demo-contact@example.invalid',
    phone: '+2340000000000',
    location: 'Sapele / Warri, Delta',
    status: 'Active',
    assignedZone: 'Delta State Sector (Sapele / Effurun)',
    avatar: 'EM',
  },
  {
    id: 'staff-04',
    name: 'Demo Staff 10',
    role: 'Legal & Compliance',
    email: 'demo-contact@example.invalid',
    phone: '+2340000000000',
    location: 'Remote / HQ',
    status: 'Active',
    assignedZone: 'Title Vetting & Land Registry',
    avatar: 'AB',
  },
];

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  target: string;
  category: 'Property' | 'Inspection' | 'User' | 'System' | 'Security';
  ipAddress: string;
  status: 'Success' | 'Flagged' | 'Pending';
}

export const AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: 'aud-901',
    timestamp: '17 Oct 2026, 09:42 WAT',
    actor: 'Victoria Nosa (Operations Lead)',
    action: 'Physical Verification Approved',
    target: 'Executive 3-Bed Terrace (prop-gra-01)',
    category: 'Property',
    ipAddress: '102.89.41.12 (Benin City)',
    status: 'Success',
  },
  {
    id: 'aud-902',
    timestamp: '17 Oct 2026, 08:15 WAT',
    actor: 'Osasere Ighodaro (Field Agent)',
    action: 'Inspection Check-In Logged',
    target: 'Inspection #insp-501 (Osahon Osagie)',
    category: 'Inspection',
    ipAddress: '105.112.98.54 (Mobile GPS Geofence)',
    status: 'Success',
  },
  {
    id: 'aud-903',
    timestamp: '16 Oct 2026, 17:30 WAT',
    actor: 'Nia (AI Assistant Engine)',
    action: 'Escalation to Human Staff Triggered',
    target: 'Conversation #conv-02 (Blessing Efosa)',
    category: 'User',
    ipAddress: '10.0.4.19 (Internal Gateway)',
    status: 'Success',
  },
  {
    id: 'aud-904',
    timestamp: '16 Oct 2026, 14:10 WAT',
    actor: 'Amina Bello (Compliance)',
    action: 'C-of-O Document Verification Uploaded',
    target: 'Townhouse Clinic Road (prop-sapele-04)',
    category: 'Property',
    ipAddress: '197.210.65.11 (Asaba/Warri)',
    status: 'Success',
  },
  {
    id: 'aud-905',
    timestamp: '16 Oct 2026, 11:05 WAT',
    actor: 'System Security Monitor',
    action: 'Failed Staff Login Attempt (Bad Password)',
    target: 'Account: demo-contact-05@example.invalid',
    category: 'Security',
    ipAddress: '41.203.74.88 (Lagos Proxy)',
    status: 'Flagged',
  },
];

export interface IntegrationService {
  name: string;
  category: string;
  status: 'Operational' | 'Degraded' | 'Configured (Sandbox)' | 'Configured (Simulation)';
  latency: string;
  description: string;
  lastHeartbeat: string;
}

export const INTEGRATIONS: IntegrationService[] = [
  {
    name: 'Demo Staff 13',
    category: 'Messaging & Assistant',
    status: 'Operational',
    latency: '180ms',
    description: 'Autonomous tenant intake, scheduling assistant, and WhatsApp conversational flow.',
    lastHeartbeat: '2 mins ago (14:21 WAT)',
  },
  {
    name: 'Demo Staff 14',
    category: 'KYC & Verification',
    status: 'Operational',
    latency: '340ms',
    description: 'Instant Nigerian National Identity Number and verified landlord verification.',
    lastHeartbeat: '1 min ago (14:22 WAT)',
  },
  {
    name: 'Demo Staff 15',
    category: 'Notifications',
    status: 'Operational',
    latency: '120ms',
    description: 'One-time passwords, gate access codes, and physical inspection reminders.',
    lastHeartbeat: '30s ago (14:23 WAT)',
  },
  {
    name: 'Demo Staff 16',
    category: 'Land Registry',
    status: 'Configured (Sandbox)',
    latency: '850ms',
    description: 'Government cadastre validation for Edo State Certificate of Occupancy (C-of-O).',
    lastHeartbeat: '12 mins ago (14:11 WAT)',
  },
  {
    name: 'Demo Staff 17',
    category: 'Mapping & Field GPS',
    status: 'Operational',
    latency: '95ms',
    description: 'Neighborhood boundary visualization and field inspector arrival check-ins.',
    lastHeartbeat: 'Just now (14:23 WAT)',
  },
];

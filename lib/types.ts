export interface Property {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  propertyType: 'Apartment' | 'Self-Contained' | 'Terrace Duplex' | 'Detached House' | 'Penthouse';
  priceAnnual: number;
  priceFormatted: string;
  serviceCharge?: string;
  cautionDeposit?: string;
  agencyLegal?: string;
  state: 'Edo' | 'Delta';
  city: string;
  neighborhood: string;
  addressShort: string;
  bedrooms: number;
  bathrooms: number;
  toilets: number;
  powerRating: string; // e.g. '20-24 hrs (Solar Backed)' or '16-18 hrs daily'
  waterSupply: string; // e.g. 'Treated Industrial Borehole'
  securityRating: string; // e.g. '24/7 Gated Uniform Guard'
  verificationBadge: 'Verified Physical Title' | 'Vetted Landlord' | 'Direct Instruction';
  inspectionStatus: 'Instant Booking' | 'Slots Available' | 'Waitlist';
  featuredImage: string;
  galleryImages: string[];
  description: string;
  features: string[];
  nearbyLandmarks: string[];
  code?: string;
  status?: string;
  address?: string;
  pricePerYear?: number;
  powerProfile?: string;
  waterProfile?: string;
  amenities?: string[];
  landmarks?: string[];
  images?: string[];
  landlordContact?: {
    name: string;
    verifiedSince: string;
    propertiesCount: number;
  };
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  state: string;
  city: string;
  preferredNeighborhoods: string[];
  budgetRange: string;
  status: 'Active Seeker' | 'Inspection Scheduled' | 'Deposit Pending' | 'Settled Tenant';
  kycStatus: 'Verified ID (NIN)' | 'Pending Verification' | 'Tier 1 Basic';
  lastActive: string;
  totalInspections: number;
  savedCount: number;
  notes: string;
}

export interface ConversationMessage {
  id: string;
  sender: 'user' | 'nia' | 'staff';
  senderName: string;
  text: string;
  timestamp: string;
  propertyReference?: {
    id: string;
    title: string;
    price: string;
    thumbnail: string;
  };
}

export interface Conversation {
  id: string;
  customerName: string;
  customerPhone: string;
  customerAvatar?: string;
  channel: 'WhatsApp' | 'Web Chat';
  status: 'AI Handled' | 'Staff Takeover' | 'Resolved' | 'Action Needed';
  lastMessage: string;
  lastTimestamp: string;
  unreadCount: number;
  assignedStaff?: string;
  propertyTitle?: string;
  messages: ConversationMessage[];
}

export interface InspectionBooking {
  id: string;
  propertyId: string;
  propertyTitle: string;
  propertyAddress: string;
  propertyImage: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  date: string;
  timeSlot: string;
  fieldAgentName: string;
  fieldAgentPhone: string;
  status: 'Confirmed' | 'Completed' | 'Pending Landlord' | 'Rescheduled' | 'Cancelled';
  inspectionNotes?: string;
}

export interface NeighborhoodGuide {
  id: string;
  slug: string;
  name: string;
  state: 'Edo' | 'Delta';
  city: string;
  heroImage: string;
  tagline: string;
  averageAnnualRent2Bed: string;
  averageAnnualRent3Bed: string;
  powerReliability: string;
  securityRating: string;
  roadNetwork: string;
  overview: string;
  highlights: string[];
  recommendedFor: string[];
  popularStreets: string[];
}

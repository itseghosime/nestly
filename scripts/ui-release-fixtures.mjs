/** Synthetic UI-only responses; never sent to a real service. */
export const SYNTHETIC_CONVERSATION_SNAPSHOT = {
  data: {
    conversationId: '11111111-1111-4111-8111-111111111111',
    mode: 'AI_ACTIVE',
    messages: [{
      id: '22222222-2222-4222-8222-222222222222',
      senderType: 'nia',
      content: 'Synthetic local conversation ready.',
      deliveryStatus: 'delivered',
      createdAt: '2026-10-21T00:00:00.000Z',
    }],
    currentProperties: [],
  },
};
export const SYNTHETIC_ACKNOWLEDGEMENT_RESPONSE = { data: { acknowledgedCount: 0 } };
export const SYNTHETIC_MESSAGE_RESPONSE = {
  data: { mode: 'AI_ACTIVE', message: 'Synthetic local response.', properties: [] },
};
export const SYNTHETIC_PROPERTIES_RESPONSE = {
  data: [{
    id: '33333333-3333-4333-8333-333333333333',
    reference: 'NST-SYN-001',
    title: 'Synthetic apartment',
    property_type: 'Apartment',
    rent_annual: 2500000,
    price_formatted: '₦2,500,000',
    state: 'Edo',
    city: 'Benin City',
    neighborhood: 'GRA',
    address_short: 'Synthetic test location',
    bedrooms: 2, bathrooms: 2,
    publication_state: 'published',
    rental_availability: 'available',
    verification_state: 'vetted',
    featured_image: '',
    gallery_images: [],
  }],
};
export const SYNTHETIC_NEIGHBORHOODS_RESPONSE = {
  data: [{
    id: '44444444-4444-4444-8444-444444444444',
    slug: 'synthetic-guide', name: 'Synthetic guide',
    state: 'Edo', city: 'Benin City',
    heroImage: '', tagline: 'Synthetic local guide',
    averageAnnualRent2Bed: 'Not supplied', averageAnnualRent3Bed: 'Not supplied',
    powerReliability: '', securityRating: '', roadNetwork: '',
    overview: 'Synthetic local content for layout checks only.',
    highlights: [], recommendedFor: [], popularStreets: [],
  }],
};


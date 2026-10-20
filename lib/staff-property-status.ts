import type { Property } from '@/lib/types';

export type StaffPropertyStatusFilter = 'all' | 'available' | 'in-review' | 'draft' | 'rented';

type PropertyStatusFields = Pick<Property, 'publicationState' | 'rentalAvailability'>;

export function getStaffPropertyStatusLabel(property: PropertyStatusFields): string {
  switch (property.publicationState) {
    case 'draft':
      return 'Draft';
    case 'review':
      return 'In Review';
    case 'published':
      switch (property.rentalAvailability) {
        case 'available':
          return 'Published · Available';
        case 'reserved':
          return 'Published · Reserved';
        case 'rented':
          return 'Published · Rented';
        case 'unavailable':
          return 'Published · Unavailable';
        default:
          return 'Published · Availability not listed';
      }
    case 'archived':
      return 'Archived';
    default:
      return 'Publication status not provided';
  }
}

export function matchesStaffPropertyStatus(
  property: PropertyStatusFields,
  filter: StaffPropertyStatusFilter,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'draft') return property.publicationState === 'draft';
  if (filter === 'in-review') return property.publicationState === 'review';
  if (filter === 'available') {
    return property.publicationState === 'published' && property.rentalAvailability === 'available';
  }
  return property.publicationState === 'published' && property.rentalAvailability === 'rented';
}

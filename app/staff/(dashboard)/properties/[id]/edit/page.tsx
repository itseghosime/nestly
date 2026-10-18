'use client';

import React, { use } from 'react';
import { PropertyEditor } from '@/components/staff/PropertyEditor';
import { fetchPropertyById } from '@/lib/properties';
import type { Property } from '@/lib/types';

export default function EditPropertyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const [property, setProperty] = React.useState<Property | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let c = false;
    fetchPropertyById(resolvedParams.id)
      .then((row) => {
        if (c) return;
        if (row) setProperty(row);
        else setLoadError('Property not found');
      })
      .catch((error: unknown) => {
        if (!c) setLoadError(error instanceof Error ? error.message : 'Failed to load');
      });
    return () => { c = true; };
  }, [resolvedParams.id]);

  if (!property) {
    return (
      <main className="flex-1 min-h-screen bg-warm p-8">
        <p role={loadError ? 'alert' : 'status'} className="mx-auto max-w-3xl rounded-xl border border-hairline bg-white p-6 text-sm text-charcoal">
          {loadError ? `Unable to load this property (${loadError}).` : 'Loading property…'}
        </p>
      </main>
    );
  }

  return <PropertyEditor key={property.id} initialProperty={property} isNew={false} />;
}

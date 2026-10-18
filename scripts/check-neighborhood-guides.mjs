// Read-only integration checks. Usage: node scripts/check-neighborhood-guides.mjs https://nestly-sigma.vercel.app
import assert from 'node:assert/strict';
const origin = process.argv[2] || 'http://localhost:3000';
const expected = ['gra-benin-city', 'ugbor-airport-road', 'clinic-road-sapele', 'effurun-gra-warri'];
const response = await fetch(new URL('/api/neighborhoods', origin));
assert.equal(response.status, 200, 'Directory API must load');
const { data } = await response.json();
assert.ok(Array.isArray(data), 'Directory data must be an array');
for (const slug of expected) {
  assert.ok(data.some((guide) => guide.slug === slug), 'Missing directory guide: ' + slug);
  const result = await fetch(new URL('/api/neighborhoods/' + slug, origin));
  assert.equal(result.status, 200, 'Guide must resolve: ' + slug);
  const { data: guide } = await result.json();
  assert.equal(guide.slug, slug);
  assert.ok(guide.overview.length > 200, 'Guide must contain useful editorial content');
  assert.ok(guide.highlights.length >= 4);
  assert.ok(guide.popularStreets.length > 0);
  const image = await fetch(new URL(guide.heroImage, origin), { method: 'HEAD' });
  assert.equal(image.status, 200, 'Guide image must resolve: ' + slug);
  console.log('PASS', slug, 'detail/content/image');
}
const missing = await fetch(new URL('/api/neighborhoods/__missing-guide-contract-test__', origin));
assert.equal(missing.status, 404, 'An unknown slug must remain a 404');
const delta = await fetch(new URL('/api/neighborhoods?state=Delta', origin));
assert.equal(delta.status, 200);
const { data: deltaGuides } = await delta.json();
assert.ok(deltaGuides.length >= 2 && deltaGuides.every((guide) => guide.state === 'Delta'));
console.log('PASS directory, unknown-slug and Delta-filter checks');

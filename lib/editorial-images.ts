// Keep existing database-backed neighbourhood image paths compatible with the editorial refresh.
const LEGACY_EDITORIAL_IMAGES: Readonly<Record<string, string>> = {
  "/images/generated/img_790f21b75f6c4829b0e7c145c8ca6112.png": "/images/editorial/home-terrace.webp",
  "/images/generated/img_182f9d8fffd242df93d3c53e9b4abbc0.png": "/images/editorial/sunlit-living-room.webp",
  "/images/generated/img_5b652e6df80b49e698189b91c2274307.png": "/images/editorial/architectural-interior.webp",
  "/images/generated/img_864608b0ef784f93a2ea34fab3c747f1.png": "/images/editorial/tropical-residence.webp",
  "/images/generated/img_319202c571e24bb2bff0a0c8ebecb4df.png": "/images/editorial/garden-entry.webp",
  "/images/generated/img_b16cbd4db4884a038e93243e9b975b81.png": "/images/editorial/neutral-detail.webp",
  "/images/generated/img_0c79e160286544189f5f68168d230479.png": "/images/editorial/modern-facade.webp",
  "/images/generated/img_21d26ecda7f74e63a2b5a318df70b1f1.png": "/images/editorial/warm-living-room.webp",
  "/images/generated/img_cf5daf1e9cf9439499d9088aa14ce3f9.png": "/images/editorial/terrace-detail.webp"
};

export function resolveEditorialImage(source: string): string {
  return LEGACY_EDITORIAL_IMAGES[source] ?? source;
}

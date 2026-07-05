/** Route-level Suspense boundary for the dynamic checkout pages. */
export default function Loading() {
  return (
    <div className="px-4 py-24 md:px-12">
      <div className="h-8 w-64 animate-pulse bg-secondary" />
      <div className="mt-6 h-4 w-40 animate-pulse bg-secondary" />
    </div>
  );
}

export default function OrderDetailLoading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-14 md:px-0">
      <div className="flex items-baseline justify-between">
        <div className="h-7 w-40 animate-pulse bg-secondary" />
        <div className="h-3 w-16 animate-pulse bg-secondary" />
      </div>
      <div className="mt-2 h-3 w-24 animate-pulse bg-secondary" />
      <div className="mt-8 border-t">
        {[0, 1].map((i) => (
          <div key={i} className="border-b py-4">
            <div className="h-5 w-48 animate-pulse bg-secondary" />
            <div className="mt-2 h-3 w-32 animate-pulse bg-secondary" />
          </div>
        ))}
      </div>
      <div className="mt-6 space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex justify-between">
            <div className="h-3 w-32 animate-pulse bg-secondary" />
            <div className="h-3 w-20 animate-pulse bg-secondary" />
          </div>
        ))}
      </div>
    </div>
  );
}

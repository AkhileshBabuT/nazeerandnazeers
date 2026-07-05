export default function OrdersLoading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-14 md:px-0">
      <div className="h-7 w-32 animate-pulse bg-secondary" />
      <div className="mt-8 border-t">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center justify-between border-b py-5">
            <div className="flex flex-col gap-2">
              <div className="h-4 w-28 animate-pulse bg-secondary" />
              <div className="h-3 w-20 animate-pulse bg-secondary" />
            </div>
            <div className="flex items-center gap-4">
              <div className="h-3 w-16 animate-pulse bg-secondary" />
              <div className="h-4 w-20 animate-pulse bg-secondary" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

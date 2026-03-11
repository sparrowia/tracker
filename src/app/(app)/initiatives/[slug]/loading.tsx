export default function InitiativeLoading() {
  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-pulse">
      {/* Breadcrumb skeleton */}
      <div className="flex items-center gap-1">
        <div className="h-4 w-16 bg-gray-200 rounded" />
        <div className="h-4 w-2 bg-gray-200 rounded" />
        <div className="h-4 w-32 bg-gray-200 rounded" />
      </div>

      {/* Header skeleton */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="h-8 w-64 bg-gray-200 rounded" />
          <div className="h-6 w-20 bg-gray-200 rounded-full" />
        </div>
        <div className="h-4 w-96 bg-gray-200 rounded mt-2" />
      </div>

      {/* Projects table skeleton */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="h-6 w-24 bg-gray-200 rounded" />
          <div className="h-8 w-28 bg-gray-200 rounded" />
        </div>
        <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
          <div className="bg-gray-800 px-4 py-2.5">
            <div className="h-4 w-28 bg-gray-600 rounded" />
          </div>
          <div className="bg-gray-50 border-b border-gray-300 px-4 py-2 flex gap-8">
            <div className="h-3 w-16 bg-gray-200 rounded" />
            <div className="h-3 w-16 bg-gray-200 rounded" />
            <div className="h-3 w-16 bg-gray-200 rounded" />
            <div className="h-3 w-16 bg-gray-200 rounded" />
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="px-4 py-3 border-b border-gray-200 flex items-center gap-8">
              <div className="h-4 w-48 bg-gray-200 rounded" />
              <div className="h-5 w-16 bg-gray-200 rounded-full" />
              <div className="h-4 w-24 bg-gray-200 rounded" />
              <div className="h-4 w-20 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

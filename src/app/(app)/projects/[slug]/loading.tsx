export default function ProjectLoading() {
  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-pulse">
      {/* Breadcrumb skeleton */}
      <div className="h-4 w-48 bg-gray-200 rounded" />

      {/* Header skeleton */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="h-8 w-56 bg-gray-200 rounded" />
          <div className="h-6 w-20 bg-gray-200 rounded-full" />
        </div>
        <div className="h-4 w-72 bg-gray-100 rounded mt-2" />
        <div className="flex gap-4 mt-3">
          <div className="h-4 w-32 bg-gray-100 rounded" />
          <div className="h-4 w-28 bg-gray-100 rounded" />
        </div>
      </div>

      {/* Tabs skeleton */}
      <div className="flex gap-6 border-b border-gray-200 pb-2">
        <div className="h-5 w-24 bg-gray-200 rounded" />
        <div className="h-5 w-20 bg-gray-200 rounded" />
        <div className="h-5 w-28 bg-gray-200 rounded" />
        <div className="h-5 w-20 bg-gray-200 rounded" />
      </div>

      {/* Content skeleton */}
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-14 bg-gray-100 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

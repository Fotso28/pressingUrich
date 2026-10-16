export default function Loading() {
  return (
    <div aria-busy className="space-y-6">
      <div className="skeleton h-8 w-56" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="skeleton h-28" /><div className="skeleton h-28" /><div className="skeleton h-28" />
      </div>
      <div className="skeleton h-72" />
    </div>
  );
}

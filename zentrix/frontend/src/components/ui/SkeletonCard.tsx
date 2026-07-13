interface SkeletonCardProps {
  wide?: boolean;
  count?: number;
}

/* ── Single poster/backdrop skeleton tile ─────────────────────────── */
export function SkeletonCard({ wide = false }: { wide?: boolean }) {
  return (
    <div
      className="flex-shrink-0 rounded-xl overflow-hidden skeleton"
      style={{
        width: wide ? 200 : 120,
        height: wide ? 120 : 175,
      }}
    >
      <div className="p-3 h-full flex flex-col justify-end gap-1.5">
        <div className="skeleton h-2.5 rounded-full w-3/4" />
        <div className="skeleton h-2 rounded-full w-1/2" />
      </div>
    </div>
  );
}

/* ── Default export kept identical to named, for ergonomic default-imports ── */
export default SkeletonCard;

/* ── Full horizontal row skeleton (title + scrolling cards) ───────── */
export function SkeletonRow({ count = 8, wide = false }: SkeletonCardProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 px-4 md:px-6 lg:px-8">
        <div className="skeleton w-5 h-5 rounded-lg" />
        <div className="skeleton h-5 w-40 rounded-full" />
      </div>
      <div className="flex gap-3 overflow-hidden px-4 md:px-6 lg:px-8">
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonCard key={i} wide={wide} />
        ))}
      </div>
    </div>
  );
}

/* ── Full-bleed hero skeleton (for homepage above-the-fold load) ──── */
export function SkeletonHero() {
  return (
    <div className="relative w-full overflow-hidden skeleton" style={{ height: '88vh', minHeight: '520px', maxHeight: '820px' }}>
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, var(--bg) 0%, transparent 60%)' }} />
      <div className="absolute bottom-24 md:bottom-32 left-4 md:left-16 lg:left-24 space-y-4 max-w-xl right-4">
        <div className="skeleton h-4 w-32 rounded-full" />
        <div className="skeleton h-12 md:h-16 w-full max-w-md rounded-xl" />
        <div className="space-y-2">
          <div className="skeleton h-4 w-full max-w-sm rounded-lg" />
          <div className="skeleton h-4 w-2/3 rounded-lg" />
        </div>
        <div className="flex gap-3 pt-2">
          <div className="skeleton h-12 w-32 rounded-xl" />
          <div className="skeleton h-12 w-36 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

/* ── Full details page skeleton (backdrop + poster + metadata) ────── */
export function SkeletonDetails() {
  return (
    <div className="min-h-dvh pt-16 page-transition">
      {/* Backdrop */}
      <div className="skeleton w-full h-[42vh] md:h-[58vh]" />
      <div className="max-w-screen-xl mx-auto px-4 md:px-8 -mt-24 md:-mt-32 relative z-10">
        <div className="flex flex-col md:flex-row gap-6 md:gap-10">
          <div className="skeleton w-32 md:w-52 h-48 md:h-80 rounded-2xl flex-shrink-0 self-start" />
          <div className="flex-1 space-y-4 pt-2 md:pt-16">
            <div className="skeleton h-8 md:h-10 w-3/4 max-w-md rounded-xl" />
            <div className="flex gap-2 flex-wrap">
              {[60, 80, 100, 70].map((w, i) => (
                <div key={i} className="skeleton h-6 rounded-full" style={{ width: w }} />
              ))}
            </div>
            <div className="space-y-2">
              {[100, 95, 88, 72].map((p, i) => (
                <div key={i} className="skeleton h-4 rounded-lg" style={{ width: `${p}%` }} />
              ))}
            </div>
            <div className="flex gap-3 pt-2">
              <div className="skeleton h-11 w-32 rounded-xl" />
              <div className="skeleton h-11 w-11 rounded-xl" />
              <div className="skeleton h-11 w-11 rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Skeleton() {
  return (
    <div className="item-grid">
      {Array.from({ length: 10 }).map((_, i) => (
        <div className="skeleton-card" key={i}>
          <i />
          <b />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

import { money } from "./api";
const colors = [
  "#3b8ee0",
  "#f2b94b",
  "#5fd0a5",
  "#9c87dc",
  "#ff8a7d",
  "#e08a3b",
  "#4aa7b8",
  "#93a9c8",
];
export default function CategoryDonut({
  categories,
}: {
  categories: { category: string; amount_cents: number }[];
}) {
  const total = categories.reduce((sum, c) => sum + c.amount_cents, 0);
  let start = 0;
  const slices = categories.map((c, i) => {
    const previous = start;
    start += (100 * c.amount_cents) / total;
    return `${colors[i % colors.length]} ${previous}% ${start}%`;
  });
  if (!total)
    return <p className="muted">Aún no registras gastos en este mes.</p>;
  return (
    <div className="category-distribution">
      <div
        className="category-donut"
        role="img"
        aria-label={
          "Distribución de gastos: " +
          categories
            .map(
              (c) =>
                `${c.category} ${Math.round((c.amount_cents / total) * 100)}%`,
            )
            .join(", ")
        }
        style={{ background: `conic-gradient(${slices.join(",")})` }}
      />
      <div className="category-legend">
        {categories.map((c, i) => (
          <div key={c.category}>
            <span
              className="category-dot"
              style={{ background: colors[i % colors.length] }}
            />
            <span className="grow">{c.category}</span>
            <b>{money(c.amount_cents)}</b>
            <small>{Math.round((c.amount_cents / total) * 100)}%</small>
          </div>
        ))}
      </div>
    </div>
  );
}

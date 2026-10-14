export default function BrandMark({
  className = "",
  decorative = false,
  transparent = false,
}: {
  className?: string;
  decorative?: boolean;
  transparent?: boolean;
}) {
  return (
    <img
      className={"brand-mark " + className}
      src={transparent ? "/beetle.svg" : "/icon.svg"}
      width="40"
      height="40"
      alt={decorative ? "" : "Balance, escarabajo ahorrador"}
      aria-hidden={decorative ? true : undefined}
    />
  );
}

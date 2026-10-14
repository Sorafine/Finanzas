import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight } from "lucide-react";
import { HistoryItem, Movement, money, dateLabel } from "./api";
export const movementKind = (kind: string) =>
  ({
    income: "Ingreso",
    expense: "Gasto",
    withdrawal: "Retiro de efectivo",
    transfer: "Transferencia",
  })[kind] || kind;
export default function MovementRow({
  item,
  onOpen,
  compact = false,
}: {
  item: Movement & Partial<HistoryItem>;
  onOpen?: () => void;
  compact?: boolean;
}) {
  const Icon =
    item.kind === "income"
      ? ArrowDownLeft
      : item.kind === "expense"
        ? ArrowUpRight
        : ArrowLeftRight;
  const content = (
    <>
      <span className={"mov-icon " + item.kind}>
        <Icon size={19} />
      </span>
      <span className="grow">
        <strong>{item.concept}</strong>
        <small>
          {compact ? (
            <>
              {item.kind === "transfer" || item.kind === "withdrawal"
                ? `${item.account_name || "Origen"} → ${item.destination_name || "Efectivo"}${item.fee_cents ? ` · comisión ${money(item.fee_cents)}` : ""}`
                : `${item.category || movementKind(item.kind)} · ${item.account_name || ""}`}
            </>
          ) : (
            <>
              {dateLabel(item.created_at)}
              {item.account_name
                ? ` · ${item.account_name}`
                : ` · ${movementKind(item.kind)}`}
            </>
          )}
        </small>
        {item.source === "payment" && (
          <small className="paid-label">Pago confirmado</small>
        )}
      </span>
      <span className={"movement-value " + item.kind}>
        {item.kind === "income" ? "+" : item.kind === "expense" ? "−" : "↔ "}
        {money(item.amount_cents)}
      </span>
    </>
  );
  return onOpen ? (
    <button
      className="movement movement-button"
      onClick={onOpen}
      aria-label={`Ver detalle: ${item.concept}`}
    >
      {content}
    </button>
  ) : (
    <div className="movement">{content}</div>
  );
}

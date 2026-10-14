import { Card, Account, money } from "../../shared/api";
import { banks, detectBank } from "../../shared/banks";
type Preview = Pick<Card, "name" | "card_type" | "last_four" | "brand"> &
  Partial<Pick<Card, "issuer" | "debt_cents" | "credit_limit_cents">>;
export default function CardVisual({
  card,
  account,
  compact = false,
}: {
  card: Preview;
  account?: Account;
  compact?: boolean;
}) {
  const bank =
    banks[detectBank(card.name, account?.name || "", card.issuer || "auto")];
  return (
    <div
      className={"bank-card " + (compact ? "compact" : "")}
      style={{ backgroundImage: `url(${bank.asset})` }}
      role="img"
      aria-label={`${bank.name}, tarjeta de ${card.card_type === "credit" ? "crédito" : "débito"} ${card.name || ""}, terminación ${card.last_four || "sin completar"}`}
    >
      <div className="bank-card-top">
        <strong className={bank.short.length > 8 ? "long-bank" : ""}>
          {bank.short}
        </strong>
        <span>{card.card_type === "credit" ? "Crédito" : "Débito"}</span>
      </div>
      <div className="bank-card-middle">
        <span className="bank-card-number">
          •••• •••• •••• {card.last_four || "••••"}
        </span>
        <strong>{card.name || "Tu próxima tarjeta"}</strong>
      </div>
      <div className="bank-card-bottom">
        <div>
          <small>
            {card.card_type === "credit"
              ? "Deuda registrada"
              : "Saldo de la cuenta"}
          </small>
          <b>
            {money(
              card.card_type === "credit"
                ? card.debt_cents || 0
                : account?.balance_cents || 0,
            )}
          </b>
        </div>
        <span className="card-network">
          {card.brand === "American Express" ? "AMEX" : card.brand || "Visa"}
        </span>
      </div>
    </div>
  );
}

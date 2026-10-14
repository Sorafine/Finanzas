import { getCsrfToken } from "./session";
export type Account = {
  id: number;
  name: string;
  kind: "bank" | "cash" | "wallet";
  balance_cents: number;
};
export type Card = {
  id: number;
  account_id: number;
  name: string;
  card_type: "debit" | "credit";
  last_four: string;
  brand: string;
  credit_limit_cents: number;
  debt_cents: number;
  closing_day: number | null;
  due_day: number | null;
  issuer:
    | "auto"
    | "bcp"
    | "bbva"
    | "interbank"
    | "scotiabank"
    | "falabella"
    | "ripley"
    | "other";
};
export type Movement = {
  id: number;
  kind: string;
  amount_cents: number;
  concept: string;
  account_id: number;
  destination_id: number | null;
  created_at: string;
  classification: string | null;
  category: string | null;
  fee_cents: number;
};
export const money = (c: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(
    c / 100,
  );
export const cents = (n: string) =>
  Math.round(Number(n.replace(",", ".")) * 100);
export async function req<T>(route: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  if (!headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  if (!["GET", "HEAD"].includes(options?.method || "GET") && getCsrfToken())
    headers.set("X-CSRF-Token", getCsrfToken());
  const res = await fetch("/api" + route, {
    ...options,
    credentials: "same-origin",
    headers,
  });
  if (!res.ok) {
    if (res.headers.get("X-Auth-Required") === "1")
      window.dispatchEvent(new Event("finanzas-session-expired"));
    let message = "No se pudo completar la operación";
    try {
      const detail = (await res.json()).detail;
      if (typeof detail === "string") message = detail;
      else if (Array.isArray(detail))
        message = "Revisa los datos del formulario";
    } catch {}
    throw new Error(message);
  }
  return res.json();
}

export type Scheduled = {
  id: number;
  name: string;
  amount_cents: number;
  due_date: string;
  frequency: "once" | "weekly" | "monthly" | "yearly";
  account_id: number;
  category: string;
  active: number;
  next_due_date?: string | null;
};
export type HistoryItem = Movement & {
  account_name: string;
  destination_name: string | null;
  scheduled_id: number | null;
  payment_due_date: string | null;
  source: "manual" | "gmail" | "payment";
};
export type HistoryResult = {
  items: HistoryItem[];
  total: number;
  page: number;
  page_size: number;
  totals: { count: number; income_cents: number; expense_cents: number };
};
export const dateLabel = (value: string) =>
  new Intl.DateTimeFormat("es-PE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/Lima",
  }).format(new Date(value.length === 10 ? value + "T12:00:00-05:00" : value));
export const localToday = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) =>
    parts.find((p) => p.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
};
export const frequencyLabel = {
  once: "Una vez",
  weekly: "Semanal",
  monthly: "Mensual",
  yearly: "Anual",
};

export type Insights = {
  monthly: { month: string; income_cents: number; expense_cents: number }[];
  categories: { category: string; amount_cents: number }[];
  current: { month: string; income_cents: number; expense_cents: number };
  margin_percent: number | null;
  previous_margin_percent: number | null;
};
export function dateShift(day: string, delta: number) {
  const d = new Date(day + "T12:00:00-05:00");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
export const monthName = (day = localToday()) =>
  new Intl.DateTimeFormat("es-PE", {
    month: "long",
    timeZone: "America/Lima",
  }).format(new Date(day + "T12:00:00-05:00"));
export function dueLabel(day: string) {
  const n = Math.round(
    (Date.parse(day + "T12:00:00-05:00") -
      Date.parse(localToday() + "T12:00:00-05:00")) /
      86400000,
  );
  return n < 0
    ? `Vencido hace ${-n} días`
    : n === 0
      ? "Vence hoy"
      : n === 1
        ? "Vence mañana"
        : `Vence en ${n} días`;
}

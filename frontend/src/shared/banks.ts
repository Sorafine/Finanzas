export const banks = {
  bcp: { name: "BCP", short: "BCP", color: "#073aa0", asset: "/cards/bcp.svg" },
  bbva: {
    name: "BBVA",
    short: "BBVA",
    color: "#073568",
    asset: "/cards/bbva.svg",
  },
  interbank: {
    name: "Interbank",
    short: "Interbank",
    color: "#00865e",
    asset: "/cards/interbank.svg",
  },
  scotiabank: {
    name: "Scotiabank",
    short: "Scotiabank",
    color: "#c93642",
    asset: "/cards/scotiabank.svg",
  },
  falabella: {
    name: "Banco Falabella",
    short: "CMR Falabella",
    color: "#39783d",
    asset: "/cards/falabella.svg",
  },
  ripley: {
    name: "Banco Ripley",
    short: "Ripley",
    color: "#5e326f",
    asset: "/cards/ripley.svg",
  },
  other: {
    name: "Otra entidad",
    short: "Mi tarjeta",
    color: "#7055b7",
    asset: "/cards/other.svg",
  },
} as const;
export type Issuer = keyof typeof banks;
export function detectBank(
  name: string,
  accountName: string,
  choice: string = "auto",
): Issuer {
  if (choice !== "auto" && choice in banks) return choice as Issuer;
  const patterns: [Issuer, RegExp][] = [
    ["bcp", /\bbcp\b|banco de credito/],
    ["bbva", /\bbbva\b|continental/],
    ["interbank", /interbank/],
    ["scotiabank", /scotiabank|scotia/],
    ["falabella", /falabella|\bcmr\b/],
    ["ripley", /ripley/],
  ];
  for (const candidate of [name, accountName]) {
    const text = candidate
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    const bank = patterns.find(([, pattern]) => pattern.test(text))?.[0];
    if (bank) return bank;
  }
  return "other";
}

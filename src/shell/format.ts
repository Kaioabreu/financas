const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl0 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export const money = (v: number) => brl.format(v);
export const moneyRound = (v: number) => brl0.format(v);
/** Negative values with a real minus sign. */
export const signedMoney = (v: number) => (v < 0 ? "−" : "") + brl.format(Math.abs(v));

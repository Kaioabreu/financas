import { describe, expect, it } from "vitest";
import { amountColor, directionIcon, flowOf, signedAmount } from "./rowFlow";

const nbsp = "\u00a0";

describe("rowFlow", () => {
  it("sign and flow follow the nature, not the raw sign", () => {
    expect(signedAmount({ nature: "expense", amount: 10 })).toBe(`-R$${nbsp}10,00`);
    expect(signedAmount({ nature: "expense", amount: -10 })).toBe(`-R$${nbsp}10,00`);
    expect(signedAmount({ nature: "income", amount: 1500.5 })).toBe(`+R$${nbsp}1.500,50`);
    expect(signedAmount({ nature: "own-transfer", amount: -30 })).toBe(`R$${nbsp}30,00`);
    expect(flowOf({ nature: "refund" })).toBe("in");
    expect(flowOf({ nature: "personal-loan" })).toBe("neutral");
  });
  it("color: ink out, green in, muted neutral", () => {
    const c = { ink: "i", ink2: "m" };
    expect(amountColor("out", c, "g")).toBe("i");
    expect(amountColor("in", c, "g")).toBe("g");
    expect(amountColor("neutral", c, "g")).toBe("m");
  });
  it("direction icon by nature", () => {
    expect(directionIcon({ nature: "own-transfer" })).toBe("own-transfer");
    expect(directionIcon({ nature: "investment" })).toBe("investment");
    expect(directionIcon({ nature: "withdrawal" })).toBe("investment");
    expect(directionIcon({ nature: "income" })).toBe("in");
    expect(directionIcon({ nature: "bill-payment" })).toBe("out");
  });
});

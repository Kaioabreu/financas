import { describe, expect, it } from "vitest";
import { rowTitle } from "./rowTitle";

describe("rowTitle", () => {
  it("Pix keeps the standard format", () => {
    expect(rowTitle("Pix recebido ANA SOUZA", 5)).toMatchObject({ title: "Pix de Ana Souza", kind: "pix-received" });
  });
  it("a merchant is cleaned and the original is kept", () => {
    expect(rowTitle("EC *SAMSUNGSAO PAULOBRA", -5)).toMatchObject({ title: "Samsung", original: "EC *SAMSUNGSAO PAULOBRA" });
  });
  it("custom aliases", () => {
    expect(rowTitle("LOJA XYZ 1", -5, [{ contains: "loja xyz", name: "Loja X" }]).title).toBe("Loja X");
  });
});

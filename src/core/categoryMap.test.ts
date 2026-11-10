import { describe, expect, it } from "vitest";
import { PLUGGY_CATEGORIES } from "../testing/pluggyCategories";
import { embeddedConfig } from "./config";
import { mapPluggyCategory } from "./categoryMap";

const cfg = embeddedConfig;
const byId = (id: string) => mapPluggyCategory(cfg, null, id);
const byName = (name: string) => mapPluggyCategory(cfg, name, null);

describe("categoria do Pluggy -> categoria do app", () => {
  it("a taxonomia real tem 130 categorias e todas têm destino, pelo id e pelo nome", () => {
    expect(PLUGGY_CATEGORIES).toHaveLength(130);
    const semDestino = PLUGGY_CATEGORIES.filter(([id, name]) => !byId(id) || !byName(name)).map(([id]) => id);
    expect(semDestino).toEqual([]);
  });

  it("id e nome concordam em todas as categorias", () => {
    const divergentes = PLUGGY_CATEGORIES.filter(([id, name]) => byId(id) !== byName(name)).map(([id]) => id);
    expect(divergentes).toEqual([]);
  });

  it.each([
    ["10000000", "groceries"],
    ["11010000", "food"],
    ["11020000", "food"],
    ["12010000", "travel"],
    ["12020000", "travel"],
    ["14020000", "leisure"],
    ["15010000", "fees-taxes"],
    ["16030000", "fees-taxes"],
    ["17010000", "fixed-bills"],
    ["17020002", "fixed-bills"],
    ["17030000", "shopping"],
    ["17040000", "fixed-bills"],
    ["18020000", "health"],
    ["19010000", "transport"],
    ["19020000", "transport"],
    ["19050005", "transport"],
    ["19050004", "fees-taxes"],
    ["200400000", "fixed-bills"],
    ["21000000", "leisure"],
    ["02020000", "fees-taxes"],
    ["07010002", "fixed-bills"],
    ["07020003", "other"],
    ["07030001", "health"],
    ["07040003", "leisure"],
    ["08060000", "shopping"],
    ["08070000", "shopping"],
    ["09010000", "leisure"],
    ["09020000", "subscriptions"],
    ["13000000", "other"],
    ["05090004", "other"],
    ["99999999", "other"],
  ])("o id %s cai em %s", (id, esperado) => {
    expect(byId(id)).toBe(esperado);
  });

  it("um id novo de um grupo conhecido herda o destino do grupo; o desconhecido não tem destino", () => {
    expect(byId("11990000")).toBe("food");
    expect(byId("77000000")).toBeUndefined();
    expect(mapPluggyCategory(cfg, "Coisa Nova", null)).toBeUndefined();
    expect(mapPluggyCategory(cfg, null, null)).toBeUndefined();
  });

  it("o id vale mais que o nome quando divergem", () => {
    expect(mapPluggyCategory(cfg, "Shopping", "19010000")).toBe("transport");
  });

  it("sem id (ou id desconhecido), o nome decide, sem acento nem caixa", () => {
    expect(mapPluggyCategory(cfg, "TAXI AND RIDE-HAILING", null)).toBe("transport");
    expect(mapPluggyCategory(cfg, "Groceries", "77000000")).toBe("groceries");
  });
});

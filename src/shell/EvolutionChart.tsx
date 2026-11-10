import { useState } from "react";
import { Text, View } from "react-native";
import type { CurvePoint } from "../core/networth";
import { signedMoney } from "./format";
import { Fine, font, usePalette } from "./theme";

const SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const PLOT_H = 130;
const PAD_X = 14;
const PAD_Y = 12;

const labelOf = (p: CurvePoint) => (p.today ? "hoje" : SHORT[Number(p.month.slice(5, 7)) - 1]!);
const fullLabelOf = (p: CurvePoint) => (p.today ? "hoje" : `${SHORT[Number(p.month.slice(5, 7)) - 1]} de ${p.month.slice(0, 4)}`);

/**
 * The Patrimônio curve: a line through the month-end points, the estimated ones in gray and the
 * "hoje" one in blue. Only the chosen point's value is written (the last one at first); touch or
 * drag along the chart to read another month.
 */
export function EvolutionChart({ curve }: { curve: CurvePoint[] }) {
  const c = usePalette();
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  if (curve.length === 0) return null;
  const on = Math.min(picked ?? curve.length - 1, curve.length - 1);
  const point = curve[on]!;

  const values = curve.map((p) => p.total);
  const span = Math.max(...values) - Math.min(...values) || Math.max(1, Math.abs(values[0]!));
  const lo = Math.min(...values) - span * 0.12;
  const hi = Math.max(...values) + span * 0.12;
  const innerW = Math.max(1, width - PAD_X * 2);
  const x = (i: number) => PAD_X + (curve.length === 1 ? innerW / 2 : (innerW * i) / (curve.length - 1));
  const y = (v: number) => PAD_Y + (PLOT_H - PAD_Y * 2) * (1 - (v - lo) / (hi - lo));
  const gray = c.ink2;

  const pick = (locationX: number) => {
    if (curve.length === 1) return setPicked(0);
    const i = Math.round(((locationX - PAD_X) / innerW) * (curve.length - 1));
    setPicked(Math.max(0, Math.min(curve.length - 1, i)));
  };

  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ minHeight: 56 }}>
        <Text style={{ fontFamily: font.semibold, fontSize: 22, color: point.total < 0 ? c.neg : c.ink }}>{signedMoney(point.total)}</Text>
        <Fine>{`${fullLabelOf(point)}${point.estimated ? " · estimado" : ""}`}</Fine>
      </View>

      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => pick(e.nativeEvent.locationX)}
        onResponderMove={(e) => pick(e.nativeEvent.locationX)}
        style={{ height: PLOT_H, marginTop: 8 }}
        accessibilityLabel="Evolução do patrimônio. Toque ou arraste para ver outro mês."
      >
        {width > 0 ? (
          <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width, height: PLOT_H }}>
            {curve.slice(1).map((p, k) => {
              const a = curve[k]!;
              const x1 = x(k);
              const y1 = y(a.total);
              const x2 = x(k + 1);
              const y2 = y(p.total);
              const len = Math.hypot(x2 - x1, y2 - y1);
              const estimated = a.estimated || p.estimated;
              return (
                <View
                  key={p.month}
                  style={{
                    position: "absolute",
                    left: (x1 + x2) / 2 - len / 2,
                    top: (y1 + y2) / 2 - 1.25,
                    width: len,
                    height: 2.5,
                    borderRadius: 2,
                    backgroundColor: gray,
                    opacity: estimated ? 0.4 : 0.9,
                    transform: [{ rotate: `${Math.atan2(y2 - y1, x2 - x1)}rad` }],
                  }}
                />
              );
            })}
            {curve.map((p, i) => {
              const size = i === on ? 14 : p.today ? 12 : 9;
              const color = p.today ? c.acc : p.estimated ? gray : c.ink;
              return (
                <View
                  key={p.month}
                  style={{
                    position: "absolute",
                    left: x(i) - size / 2,
                    top: y(p.total) - size / 2,
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: p.estimated ? c.bg : color,
                    borderWidth: 2,
                    borderColor: color,
                    opacity: p.estimated ? 0.6 : 1,
                  }}
                />
              );
            })}
          </View>
        ) : null}
      </View>

      <View style={{ height: 22, marginTop: 4 }} pointerEvents="none">
        {width > 0
          ? curve.map((p, i) => (
              <Text
                key={p.month}
                numberOfLines={1}
                style={{
                  position: "absolute",
                  left: x(i) - 16,
                  width: 32,
                  textAlign: "center",
                  fontFamily: i === on || p.today ? font.semibold : font.regular,
                  fontSize: 11,
                  color: i === on ? c.ink : p.today ? c.acc : c.ink2,
                }}
              >
                {labelOf(p)}
              </Text>
            ))
          : null}
      </View>
    </View>
  );
}

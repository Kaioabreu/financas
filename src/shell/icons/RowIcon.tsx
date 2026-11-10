import { Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { font, usePalette } from "../theme";
import { ICON_STROKE, ICON_VIEWBOX, iconPaths, type IconName } from "./paths";

const CONTAINER = 42;
const GLYPH = 20;
/** Cap height of the initial is about 0.7 of the font size; this makes it as tall as the drawn glyphs. */
const INITIAL_FONT = 21;

/** The round badge of a row: one line icon or a person's initial, always the same size, stroke and color. */
export function RowIcon({ icon, initial }: { icon?: IconName; initial?: string }) {
  const c = usePalette();
  return (
    <View style={{ width: CONTAINER, height: CONTAINER, borderRadius: CONTAINER / 2, backgroundColor: c.track, alignItems: "center", justifyContent: "center" }}>
      {initial ? (
        <Text style={{ fontFamily: font.regular, fontSize: INITIAL_FONT, lineHeight: INITIAL_FONT + 3, color: c.ink2 }}>{initial}</Text>
      ) : icon ? (
        <Svg width={GLYPH} height={GLYPH} viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`} fill="none" stroke={c.ink2} strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
          {iconPaths[icon].map((d, i) => (
            <Path key={i} d={d} />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

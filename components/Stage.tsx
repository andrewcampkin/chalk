import { useEffect, useRef, useState } from "react";
import {
  Animated,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors, radius, space, tap, type as t } from "../lib/theme";

/**
 * The staged setup: one question on screen at a time, answered by swiping
 * sideways through its options and tapping the one under your thumb.
 *
 * A thumb travelling sideways is how you choose things on a phone. The earlier
 * pass at this had arrow buttons either side and a Next button below, which is
 * a mouse-shaped design wearing a phone's clothes: three separate targets to
 * hit accurately for what is really one gesture. Here the swipe changes the
 * value and the tap commits it, so choosing and advancing are the same motion.
 *
 * Neighbours stay half-visible and dimmed on both sides. That is the only thing
 * telling you the row can be swiped at all, so it is not decoration — never
 * widen the item to fill the card.
 */

export type StageOption = { key: string; label: string };

export function StageCarousel({
  label,
  options,
  index,
  caption,
  onIndex,
  onCommit,
  total,
  step,
}: {
  label: string;
  options: StageOption[];
  /** Which option is centred. */
  index: number;
  /** What this answer will read as on the whiteboard. */
  caption?: string;
  /** A swipe settled, or a peeking neighbour was tapped. */
  onIndex: (i: number) => void;
  /** The centred option was tapped: take it and move on. */
  onCommit: () => void;
  /** Position in the run of stages, for the progress dots. */
  total: number;
  step: number;
}) {
  const [width, setWidth] = useState(0);
  const scrollRef = useRef<any>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const settled = useRef(index);

  // Half the card, so a whole neighbour's worth of each side stays in view.
  const item = width * 0.5;
  const pad = width > 0 ? (width - item) / 2 : 0;

  // Follow the value when it changes from outside the swipe — entering the
  // stage, or a number typed on the pad that is not one of the presets.
  useEffect(() => {
    if (!item || index < 0 || settled.current === index) return;
    settled.current = index;
    scrollRef.current?.scrollTo({ x: index * item, animated: true });
  }, [index, item]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const onSettle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!item) return;
    const i = Math.max(0, Math.min(options.length - 1, Math.round(e.nativeEvent.contentOffset.x / item)));
    if (i === settled.current) return;
    settled.current = i;
    onIndex(i);
  };

  return (
    <View style={s.card} onLayout={onLayout}>
      <Text style={s.label}>{label}</Text>

      {width > 0 && (
        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={item}
          decelerationRate="fast"
          disableIntervalMomentum
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: pad }}
          contentOffset={{ x: index * item, y: 0 }}
          scrollEventThrottle={16}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
            useNativeDriver: true,
          })}
          onMomentumScrollEnd={onSettle}
          // A slow drag that never gains momentum fires no momentum event.
          onScrollEndDrag={onSettle}
        >
          {options.map((o, i) => {
            const range = [(i - 1) * item, i * item, (i + 1) * item];
            const opacity = scrollX.interpolate({
              inputRange: range,
              outputRange: [0.25, 1, 0.25],
              extrapolate: "clamp",
            });
            const scale = scrollX.interpolate({
              inputRange: range,
              outputRange: [0.7, 1, 0.7],
              extrapolate: "clamp",
            });
            return (
              <Animated.View key={o.key} style={{ width: item, opacity, transform: [{ scale }] }}>
                <Pressable
                  // Tapping what is already centred takes it. Tapping a
                  // neighbour brings it over rather than committing something
                  // half off the screen that was never really chosen.
                  onPress={() => (i === index ? onCommit() : onIndex(i))}
                  style={({ pressed }) => [s.item, pressed && i === index && s.itemPressed]}
                >
                  <Text style={s.value} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.5}>
                    {o.label}
                  </Text>
                </Pressable>
              </Animated.View>
            );
          })}
        </Animated.ScrollView>
      )}

      <Text style={s.hint}>{caption || "Tap to choose"}</Text>

      <View style={s.dots}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={[s.dot, i === step && s.dotOn]} />
        ))}
      </View>
    </View>
  );
}

/**
 * What has been answered so far, and the way back into any of it.
 *
 * Reads as the whiteboard header it is building towards — "WOD · For time · 5
 * rounds" — so the stages never feel like a form filled in blind. This is also
 * why there is no Back button: the trail is more precise than one, because it
 * returns to the stage you actually want rather than the previous one.
 */
export function StageTrail({
  items,
  onPick,
}: {
  items: StageOption[];
  onPick: (key: string) => void;
}) {
  if (!items.length) return null;
  return (
    <View style={s.trail}>
      {items.map((it, i) => (
        <View key={it.key} style={s.trailItem}>
          {i > 0 && <Text style={s.trailDot}>·</Text>}
          <Pressable onPress={() => onPick(it.key)} hitSlop={10}>
            <Text style={s.trailText}>{it.label}</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    marginHorizontal: space.lg,
    marginTop: space.md,
    paddingVertical: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  label: {
    color: colors.textFaint,
    fontSize: t.label,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    textAlign: "center",
    marginBottom: space.md,
  },

  // Tall enough that the swipe has somewhere to land even with shaking hands,
  // and taller than the 56 minimum because this is the target that matters.
  item: {
    height: 84,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.xs,
  },
  itemPressed: { opacity: 0.5 },
  value: {
    color: colors.text,
    fontSize: t.score,
    fontWeight: "700",
    textAlign: "center",
  },

  hint: {
    color: colors.textFaint,
    fontSize: t.label,
    textAlign: "center",
    marginTop: space.sm,
  },

  dots: { flexDirection: "row", justifyContent: "center", gap: space.sm, marginTop: space.md },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.line },
  // Not the accent: chalk yellow means "record" and nothing else (invariant 10).
  dotOn: { backgroundColor: colors.textDim },

  trail: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    minHeight: tap.min - 20,
  },
  trailItem: { flexDirection: "row", alignItems: "center" },
  trailDot: { color: colors.textFaint, fontSize: t.body, paddingHorizontal: space.sm },
  trailText: {
    color: colors.textDim,
    fontSize: t.body,
    fontWeight: "600",
    paddingVertical: space.xs,
  },
});

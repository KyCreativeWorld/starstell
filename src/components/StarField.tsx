import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';

const STAR_COUNT = 90;
const useNativeDriver = Platform.OS !== 'web';

interface Star {
  left: `${number}%`;
  top: `${number}%`;
  size: number;
  duration: number;
  delay: number;
  minOpacity: number;
}

function makeStars(count: number): Star[] {
  return Array.from({ length: count }, () => ({
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`,
    size: 1 + Math.random() * 1.8,
    duration: 1500 + Math.random() * 2500,
    delay: Math.random() * 3000,
    minOpacity: 0.2 + Math.random() * 0.25,
  }));
}

function BlinkingStar({ star }: { star: Star }) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: star.minOpacity,
          duration: star.duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: star.duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver,
        }),
      ]),
    );
    const timer = setTimeout(() => loop.start(), star.delay);
    return () => {
      clearTimeout(timer);
      loop.stop();
    };
  }, [opacity, star]);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: star.left,
        top: star.top,
        width: star.size,
        height: star.size,
        borderRadius: star.size / 2,
        backgroundColor: '#ffffff',
        opacity,
      }}
    />
  );
}

/** Black sky with tiny white stars that fade between bright and faint. */
export function StarField() {
  const stars = useMemo(() => makeStars(STAR_COUNT), []);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {stars.map((star, i) => (
        <BlinkingStar key={i} star={star} />
      ))}
    </View>
  );
}

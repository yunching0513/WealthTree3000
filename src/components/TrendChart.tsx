/** 輕量價格走勢折線圖（react-native-svg，無第三方圖表依賴）。 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Line, Path, Stop } from 'react-native-svg';
import { PricePoint } from '../services/news';
import { colors, font } from '../theme';

interface TrendChartProps {
  points: PricePoint[];
  up: boolean; // 區間上漲為紅、下跌為綠（台股慣例）
  width: number;
  height?: number;
}

/** 點數過多時等距降採樣，保留首尾，避免過長 path 影響效能。 */
function downsample(pts: PricePoint[], max: number): PricePoint[] {
  if (pts.length <= max) return pts;
  const step = (pts.length - 1) / (max - 1);
  const out: PricePoint[] = [];
  for (let i = 0; i < max; i++) out.push(pts[Math.round(i * step)]);
  return out;
}

export function TrendChart({ points, up, width, height = 200 }: TrendChartProps) {
  if (!points || points.length < 2) {
    return (
      <View style={[styles.empty, { width, height }]}>
        <Text style={styles.emptyText}>資料不足，無法繪製走勢</Text>
      </View>
    );
  }

  const data = downsample(points, 140);
  const padX = 8;
  const padTop = 12;
  const padBottom = 16;
  const innerW = width - padX * 2;
  const innerH = height - padTop - padBottom;
  const baselineY = padTop + innerH;

  const closes = data.map((p) => p.c);
  let min = Math.min(...closes);
  let max = Math.max(...closes);
  if (min === max) {
    min -= 1;
    max += 1;
  }

  const x = (i: number) => padX + (i / (data.length - 1)) * innerW;
  const y = (c: number) => padTop + (1 - (c - min) / (max - min)) * innerH;

  const line = data.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(2)} ${y(p.c).toFixed(2)}`).join(' ');
  const area = `${line} L ${x(data.length - 1).toFixed(2)} ${baselineY.toFixed(2)} L ${x(0).toFixed(2)} ${baselineY.toFixed(2)} Z`;

  const tint = up ? colors.danger : colors.leafDeep;
  const lastX = x(data.length - 1);
  const lastY = y(data[data.length - 1].c);

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={tint} stopOpacity={0.22} />
          <Stop offset="1" stopColor={tint} stopOpacity={0.02} />
        </LinearGradient>
      </Defs>
      <Line x1={padX} y1={baselineY} x2={width - padX} y2={baselineY} stroke="#E3DECF" strokeWidth={1} />
      <Path d={area} fill="url(#trendFill)" />
      <Path d={line} stroke={tint} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={lastX} cy={lastY} r={3.5} fill={tint} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: font.small, color: colors.inkFaint },
});

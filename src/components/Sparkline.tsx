/** 迷你走勢圖（sparkline）：自選股清單與指數卡用的極簡折線，react-native-svg 手繪、無第三方圖表依賴。 */
import React from 'react';
import Svg, { Polyline } from 'react-native-svg';

/** 點數過多時等距降採樣，保留首尾（比照 TrendChart 的做法），避免過長 Polyline 影響清單效能。 */
function downsample(pts: number[], max: number): number[] {
  if (pts.length <= max) return pts;
  const step = (pts.length - 1) / (max - 1);
  const out: number[] = [];
  for (let i = 0; i < max; i++) out.push(pts[Math.round(i * step)]);
  return out;
}

export function Sparkline({
  points,
  width = 64,
  height = 24,
  color,
}: {
  points: number[];
  width?: number;
  height?: number;
  color: string;
}) {
  // 防禦：剔除非有限值（null/NaN 混入時），少於 2 點無法成線就不畫
  const usable = (points ?? []).filter((v) => Number.isFinite(v));
  if (usable.length < 2) return null;

  const data = downsample(usable, 60);
  const pad = 2; // 內縮 2px，避免線條在邊緣被裁切
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  // min/max 正規化；全部同值時人工撐開範圍，畫成置中水平線
  let min = Math.min(...data);
  let max = Math.max(...data);
  if (min === max) {
    min -= 1;
    max += 1;
  }

  const attr = data
    .map((v, i) => {
      const x = pad + (i / (data.length - 1)) * innerW;
      const y = pad + (1 - (v - min) / (max - min)) * innerH;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <Svg width={width} height={height}>
      <Polyline
        points={attr}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

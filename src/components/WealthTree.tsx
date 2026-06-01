/**
 * 財富樹 — 把財務狀態具象化的核心視覺。
 *
 *  growth     0..1  總資產 → 樹高與樹冠大小
 *  root       0..1  房貸還款進度 → 根系深度
 *  health     0..1  生活費控管 → 葉片翠綠 / 轉黃掉落
 *  season           大盤趨勢 → 春夏繁盛 / 秋冬落葉
 *  rings            連續紀律年數 → 樹幹年輪
 *  companions       解鎖的陪伴動物（emoji）
 *  lean       角度  暴風雨時的傾斜（由外層動畫驅動）
 */
import React, { useMemo } from 'react';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { colors } from '../theme';
import type { Season } from '../store/finance';

export interface WealthTreeProps {
  growth: number;
  root: number;
  health: number;
  season: Season;
  rings: number;
  companions: string[];
  lean?: number;
  width?: number;
  height?: number;
}

const VB_W = 300;
const VB_H = 440;
const GROUND_Y = 280;
const TRUNK_X = VB_W / 2;

interface Palette {
  skyTop: string;
  skyBottom: string;
  foliage: string;
  foliageLight: string;
  bare: boolean;
}

function palette(season: Season, health: number): Palette {
  // 葉片健康度低時，整體葉色往枯黃靠攏
  const sick = health < 0.7;
  switch (season) {
    case 'summer':
      return {
        skyTop: '#BFE3F2',
        skyBottom: '#EAF6E9',
        foliage: sick ? colors.warn : colors.leafDeep,
        foliageLight: sick ? '#E0B95F' : colors.leafLight,
        bare: false,
      };
    case 'spring':
      return {
        skyTop: '#CFEAF6',
        skyBottom: '#F0F8E9',
        foliage: sick ? colors.warn : colors.leaf,
        foliageLight: sick ? '#E6C46B' : colors.leafBright,
        bare: false,
      };
    case 'autumn':
      return {
        skyTop: '#E9DAC2',
        skyBottom: '#F3EAD6',
        foliage: colors.wither,
        foliageLight: colors.warn,
        bare: false,
      };
    case 'winter':
      return {
        skyTop: '#D7DEE3',
        skyBottom: '#ECEFE9',
        foliage: colors.barkDark,
        foliageLight: colors.bark,
        bare: true,
      };
  }
}

// 樹冠上葉簇的相對位置（確定性，避免每次 render 跳動）
const CANOPY_BLOBS = [
  { dx: 0, dy: -0.62, r: 0.62 },
  { dx: -0.55, dy: -0.3, r: 0.5 },
  { dx: 0.55, dy: -0.3, r: 0.5 },
  { dx: -0.32, dy: -0.75, r: 0.46 },
  { dx: 0.32, dy: -0.75, r: 0.46 },
  { dx: 0, dy: -0.95, r: 0.4 },
];

export function WealthTree({
  growth,
  root,
  health,
  season,
  rings,
  companions,
  lean = 0,
  width = 320,
  height,
}: WealthTreeProps) {
  const h = height ?? (width * VB_H) / VB_W;
  const pal = palette(season, health);

  const trunkH = 50 + growth * 150;
  const trunkW = 14 + growth * 24;
  const canopyR = 34 + growth * 86;
  const canopyCY = GROUND_Y - trunkH - canopyR * 0.45;
  const rootDepth = 18 + root * 130;

  // 葉片健康度 → 樹冠上掉落 / 殘存的葉量
  const foliageOpacity = pal.bare ? 0.0 : 0.55 + health * 0.45;

  const rootPaths = useMemo(() => makeRoots(root), [root]);
  const fallingLeaves = useMemo(
    () => makeFallingLeaves(health, season),
    [health, season],
  );

  return (
    <Svg width={width} height={h} viewBox={`0 0 ${VB_W} ${VB_H}`}>
      <Defs>
        <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={pal.skyTop} />
          <Stop offset="1" stopColor={pal.skyBottom} />
        </LinearGradient>
        <LinearGradient id="soil" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.soil} />
          <Stop offset="1" stopColor={colors.soilDark} />
        </LinearGradient>
      </Defs>

      {/* 天空 */}
      <Rect x={0} y={0} width={VB_W} height={GROUND_Y} fill="url(#sky)" />
      {/* 太陽（多頭時露臉） */}
      {(season === 'summer' || season === 'spring') && (
        <Circle cx={250} cy={56} r={26} fill={colors.sun} opacity={0.9} />
      )}
      {season === 'winter' && (
        <>
          <Circle cx={70} cy={50} r={5} fill="#FFFFFF" opacity={0.9} />
          <Circle cx={120} cy={80} r={4} fill="#FFFFFF" opacity={0.8} />
          <Circle cx={210} cy={64} r={5} fill="#FFFFFF" opacity={0.85} />
        </>
      )}

      {/* 土壤 */}
      <Rect x={0} y={GROUND_Y} width={VB_W} height={VB_H - GROUND_Y} fill="url(#soil)" />
      <Line x1={0} y1={GROUND_Y} x2={VB_W} y2={GROUND_Y} stroke={colors.barkDark} strokeWidth={2} opacity={0.3} />

      {/* 根系（房貸還款深度） */}
      <G opacity={0.9}>
        {rootPaths.map((d, i) => (
          <Path key={i} d={d} stroke={colors.barkDark} strokeWidth={3 - i * 0.15} fill="none" strokeLinecap="round" />
        ))}
      </G>
      {/* 根深刻度線 */}
      <Line
        x1={TRUNK_X - 70}
        y1={GROUND_Y + rootDepth}
        x2={TRUNK_X + 70}
        y2={GROUND_Y + rootDepth}
        stroke={colors.ring}
        strokeWidth={1.5}
        strokeDasharray="4 5"
        opacity={0.6}
      />

      {/* 地面上的樹（可被暴風雨吹斜） */}
      <G rotation={lean} origin={`${TRUNK_X}, ${GROUND_Y}`}>
        {/* 樹幹 */}
        <Path
          d={trunkPath(trunkW, trunkH)}
          fill={colors.bark}
        />
        {/* 年輪（連續紀律年數） */}
        {Array.from({ length: Math.min(rings, 6) }).map((_, i) => (
          <Ellipse
            key={i}
            cx={TRUNK_X}
            cy={GROUND_Y - 18 - i * 14}
            rx={trunkW / 2 - 2}
            ry={3}
            stroke={colors.ring}
            strokeWidth={1.5}
            fill="none"
            opacity={0.8}
          />
        ))}

        {/* 樹冠 / 枝葉 */}
        {pal.bare ? (
          <BareBranches cx={TRUNK_X} cy={canopyCY} r={canopyR} color={colors.bark} />
        ) : (
          <G opacity={foliageOpacity}>
            {CANOPY_BLOBS.map((b, i) => (
              <Circle
                key={i}
                cx={TRUNK_X + b.dx * canopyR}
                cy={canopyCY + b.dy * canopyR * 0.6}
                r={b.r * canopyR}
                fill={i % 2 === 0 ? pal.foliage : pal.foliageLight}
              />
            ))}
          </G>
        )}

        {/* 陪伴動物（停在樹冠上） */}
        {companions.slice(0, 6).map((emoji, i) => {
          const angle = (i / Math.max(companions.length, 1)) * Math.PI - Math.PI / 2;
          return (
            <SvgText
              key={i}
              x={TRUNK_X + Math.cos(angle) * canopyR * 0.7}
              y={canopyCY - Math.sin(angle) * canopyR * 0.5 + 6}
              fontSize={18}
              textAnchor="middle"
            >
              {emoji}
            </SvgText>
          );
        })}
      </G>

      {/* 落葉（超支或秋冬） */}
      {fallingLeaves.map((leaf, i) => (
        <Circle key={i} cx={leaf.x} cy={leaf.y} r={leaf.r} fill={leaf.color} opacity={0.8} />
      ))}
    </Svg>
  );
}

function trunkPath(w: number, hgt: number): string {
  const baseL = TRUNK_X - w / 2;
  const baseR = TRUNK_X + w / 2;
  const topL = TRUNK_X - w / 3.2;
  const topR = TRUNK_X + w / 3.2;
  const topY = GROUND_Y - hgt;
  // 底部略外擴（根基），向上微收
  return `M ${baseL - 6} ${GROUND_Y} Q ${baseL} ${GROUND_Y - hgt * 0.4} ${topL} ${topY} L ${topR} ${topY} Q ${baseR} ${GROUND_Y - hgt * 0.4} ${baseR + 6} ${GROUND_Y} Z`;
}

function BareBranches({ cx, cy, r, color }: { cx: number; cy: number; r: number; color: string }) {
  const branches = [
    `M ${cx} ${cy + r * 0.6} L ${cx - r * 0.7} ${cy - r * 0.2}`,
    `M ${cx} ${cy + r * 0.6} L ${cx + r * 0.7} ${cy - r * 0.2}`,
    `M ${cx} ${cy + r * 0.6} L ${cx} ${cy - r * 0.8}`,
    `M ${cx - r * 0.35} ${cy} L ${cx - r * 0.6} ${cy - r * 0.6}`,
    `M ${cx + r * 0.35} ${cy} L ${cx + r * 0.6} ${cy - r * 0.6}`,
  ];
  return (
    <G>
      {branches.map((d, i) => (
        <Path key={i} d={d} stroke={color} strokeWidth={3} strokeLinecap="round" fill="none" />
      ))}
    </G>
  );
}

function makeRoots(root: number): string[] {
  const depth = 18 + root * 130;
  const spread = 40 + root * 60;
  const tips = 5;
  const paths: string[] = [];
  for (let i = 0; i < tips; i++) {
    const t = (i / (tips - 1)) * 2 - 1; // -1..1
    const endX = TRUNK_X + t * spread;
    const endY = GROUND_Y + depth * (1 - Math.abs(t) * 0.4);
    const midX = TRUNK_X + t * spread * 0.4;
    const midY = GROUND_Y + depth * 0.5;
    paths.push(`M ${TRUNK_X} ${GROUND_Y} Q ${midX} ${midY} ${endX} ${endY}`);
  }
  return paths;
}

function makeFallingLeaves(health: number, season: Season): { x: number; y: number; r: number; color: string }[] {
  const count = season === 'autumn' || season === 'winter' ? 8 : Math.round((1 - health) * 10);
  const color = season === 'winter' || season === 'autumn' ? colors.wither : colors.warn;
  const leaves = [];
  for (let i = 0; i < count; i++) {
    leaves.push({
      x: 40 + ((i * 53) % (VB_W - 80)),
      y: 150 + ((i * 89) % (GROUND_Y - 140)),
      r: 3 + (i % 3),
      color,
    });
  }
  return leaves;
}

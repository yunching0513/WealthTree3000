/**
 * 植富 3000 視覺主題
 * 極簡、療癒、大地色系 + 多層次綠。
 */

export const colors = {
  // 大地色系背景
  soil: '#6B4F3A',
  soilDark: '#4A3728',
  sand: '#F3EFE6',
  paper: '#FBF8F1',
  card: '#FFFFFF',

  // 多層次綠（樹葉 / 生長）
  leaf: '#3E7C4F',
  leafLight: '#6FAE6E',
  leafBright: '#8FD18A',
  leafDeep: '#2C5E3A',

  // 樹幹 / 根系
  bark: '#7A5A3C',
  barkDark: '#5C432B',
  ring: '#C9A66B',

  // 狀態色
  sun: '#F4C95D',
  sky: '#CFE8F5',
  warn: '#D89B4A', // 葉片轉黃 / 溫和超支提示
  wither: '#B5772F',
  danger: '#C0563F',

  // 文字
  ink: '#33291F',
  inkSoft: '#6E6256',
  inkFaint: '#9C9286',
  onDark: '#F3EFE6',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

export const font = {
  hero: 30,
  title: 22,
  section: 17,
  body: 15,
  small: 13,
  tiny: 11,
} as const;

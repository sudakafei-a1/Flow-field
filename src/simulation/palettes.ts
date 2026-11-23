import type { PaletteConfig, PaletteId } from './types';

export const PALETTES: PaletteConfig[] = [
  {
    id: 'amber',
    name: '星夜琥珀',
    isLight: false,
    backgroundHex: '#060913',
    fogHex: '#060913',
    colors: ['#F5C77E', '#FFF3DB', '#6A97F5', '#D98C4A'],
    accentHex: '#F5C77E',
    ringHex: '#F7D49A',
    swatchGradient: 'linear-gradient(135deg, #0A1024 0%, #6A97F5 52%, #F5C77E 100%)',
  },
  {
    id: 'celadon',
    name: '极光青瓷',
    isLight: false,
    backgroundHex: '#050D10',
    fogHex: '#050D10',
    colors: ['#6CE5C5', '#DDFBF2', '#44AEE8', '#2C8C82'],
    accentHex: '#6CE5C5',
    ringHex: '#8AF0D6',
    swatchGradient: 'linear-gradient(135deg, #091B20 0%, #44AEE8 52%, #6CE5C5 100%)',
  },
  {
    id: 'dusk',
    name: '霞光赤陶',
    isLight: false,
    backgroundHex: '#0C070E',
    fogHex: '#0C070E',
    colors: ['#F28482', '#FCE7DC', '#B89BF2', '#E8A568'],
    accentHex: '#F29B88',
    ringHex: '#F7B4A0',
    swatchGradient: 'linear-gradient(135deg, #1A0E22 0%, #B89BF2 50%, #F28482 100%)',
  },
  {
    id: 'frost',
    name: '月白霜雪',
    isLight: false,
    backgroundHex: '#070B14',
    fogHex: '#070B14',
    colors: ['#E2EEFF', '#FFFFFF', '#7FB2F0', '#9EA8EA'],
    accentHex: '#A5C8FF',
    ringHex: '#C5DCFF',
    swatchGradient: 'linear-gradient(135deg, #0D1528 0%, #7FB2F0 55%, #F2F7FF 100%)',
  },
  {
    id: 'ink',
    name: '晨雾水墨',
    isLight: true,
    backgroundHex: '#F3EFE6',
    fogHex: '#F3EFE6',
    colors: ['#1E293B', '#475569', '#B4692B', '#2F4D63'],
    accentHex: '#B4692B',
    ringHex: '#8C5220',
    swatchGradient: 'linear-gradient(135deg, #F3EFE6 0%, #475569 58%, #B4692B 100%)',
  },
];

export function getPaletteById(id: PaletteId): PaletteConfig {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

/**
 * Parse a 6-digit hex color string into normalized linear-ish RGB [0..1].
 */
export function hexToRgbTuple(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const intVal = parseInt(clean, 16);
  const r = ((intVal >> 16) & 255) / 255;
  const g = ((intVal >> 8) & 255) / 255;
  const b = (intVal & 255) / 255;
  return [r, g, b];
}

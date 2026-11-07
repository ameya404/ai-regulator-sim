/**
 * Chart colors. Dark theme only (war-room dashboard).
 *
 * Categorical slots are the validated dark-mode steps, assigned in fixed order
 * and never cycled. Checked with the dataviz palette validator against the panel
 * surface #12161c: all checks pass (worst adjacent CVD ΔE 8.4, normal-vision ΔE 19.3).
 */
export const SURFACE = '#12161c';
export const GRID = '#262c35';
export const AXIS = '#3a424e';
export const INK = '#f2f4f7';
export const INK_2 = '#c4cad4';
export const MUTED = '#9aa3b2';
/** Policy-change marker lines: neutral, never a series color. */
export const MARKER = '#e8dcc0';

export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'] as const;

export const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
} as const;

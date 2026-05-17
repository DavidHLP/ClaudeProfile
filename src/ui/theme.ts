// ANSI style constants — single source of truth
export const ansi = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
} as const;

// Semantic style functions
export const theme = {
  bold: (t: string): string => `${ansi.bold}${t}${ansi.reset}`,
  dim: (t: string): string => `${ansi.dim}${t}${ansi.reset}`,
  success: (t: string): string => `${ansi.green}${t}${ansi.reset}`,
  error: (t: string): string => `${ansi.red}${t}${ansi.reset}`,
  warning: (t: string): string => `${ansi.yellow}${t}${ansi.reset}`,
  info: (t: string): string => `${ansi.cyan}${t}${ansi.reset}`,
  active: (t: string): string => `${ansi.green}${ansi.bold}${t}${ansi.reset}`,
  standby: (t: string): string => `${ansi.dim}${t}${ansi.reset}`,
};

// Icon constants
export const icon = {
  success: theme.success('✓'),
  warning: theme.warning('⚠'),
  error: theme.error('✗'),
  active: theme.success('●'),
  standby: theme.dim('○'),
  arrow: theme.success('❯'),
};

// Visual utilities
export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

export function padVisualEnd(text: string, targetWidth: number): string {
  const visualLen = stripAnsi(text).length;
  const padding = Math.max(0, targetWidth - visualLen);
  return text + ' '.repeat(padding);
}

// Unicode box-drawing
export const box = {
  tl: '┌', tr: '┐', bl: '└', br: '┘',
  h: '─', v: '│',
  lj: '├', rj: '┤', cross: '┼',
};

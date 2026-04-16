/**
 * Premium Dark-Fantasy Tactical Interface Color Palette
 * Spec: Cyber-medieval aesthetic with restrained cyan/blue energy accents and warm gold highlights
 * All hex values are Phaser-compatible (0xRRGGBB format)
 */

export const COLOR = {
  // === Background Layers ===
  // Deep gradient blacks for volumetric scene depth
  bgBase: 0x07090f,           // #07090f - deepest black (gradient bottom)
  bgMid: 0x0b1020,            // #0b1020 - mid-tone dark blue
  bgTopGradient: 0x111827,    // #111827 - gradient top (lighter for radial effect)
  bgDim: 0x05070c,            // #05070c - ultra-deep for vignette edges

  // === Surface Glass (with separate alpha values for use in rgba scenarios) ===
  // Use with 0.55 alpha for primary surfaces
  surfaceGlassPrimary: 0x0f172a,      // #0f172a - equivalent to rgba(15, 23, 42, 0.55)
  // Use with 0.38 alpha for secondary surfaces
  surfaceGlassSecondary: 0x1e293b,    // #1e293b - equivalent to rgba(30, 41, 59, 0.38)

  // === Primary Accents ===
  // Restrained cyan/blue energy for modern tech feel
  cyan: 0x00d4ff,             // #00d4ff - primary cyan accent (engagement zone, button glow)
  blue: 0x278dff,             // #278dff - secondary blue (multi-layer shadows, blend effects)
  gold: 0xf4c95d,             // #f4c95d - warm highlight for premium feel (alerts, success, luxury)

  // === Text & Semantic ===
  textHigh: 0xe6edf7,         // #e6edf7 - high contrast text (primary UI labels)
  textMid: 0xa9b4c7,          // #a9b4c7 - medium contrast text (secondary, dims)
  dangerAlert: 0xff5d73,      // #ff5d73 - urgent alert state (check pressure, critical timers)
  successConfirm: 0x5ee7a1,   // #5ee7a1 - confirmation/positive state (piece placement, captures)

  // === Utility ===
  white: 0xffffff,            // Pure white for overlays, inner glows
  transparent: 0x000000,      // Fallback (use alpha channel separately)
} as const;

/**
 * Glass surface alpha values for rgba operations
 * Use with rgba(hex, alpha) conversions
 */
export const GLASS_ALPHA = {
  primary: 0.55,              // Primary glass panels (HUD top bar, menus)
  secondary: 0.38,            // Secondary glass elements (cards, backgrounds)
  buttonBase: 0.45,           // Button background
  borderInner: 0.05,          // Very subtle inner borders
  borderDefault: 0.35,        // Standard border opacity
  textDim: 0.7,               // Dimmed text overlay
  overlay: 0.8,               // Modal/overlay dimmer
} as const;

/**
 * Shadow/glow filter values for drop-shadow effects
 * Format: [blurRadius, spreadRadius, color, opacity]
 * Usage: `drop-shadow(X Y BLUR SPREAD COLOR)`
 */
export const SHADOW = {
  // Cyan glow for active/hover states
  cyanGlow: {
    blur: 6,
    spread: 0,
    color: 0x00d4ff,
    opacity: 0.45,
    blurLarge: 16,
    opacityLarge: 0.25,       // Multi-layer: "drop-shadow(0 0 6px rgba(0,212,255,0.45)) drop-shadow(0 0 16px rgba(39,141,255,0.25))"
  },
  // Blue secondary layer
  blueLayer: {
    blur: 16,
    spread: 0,
    color: 0x278dff,
    opacity: 0.25,
  },
  // Soft inset shadow for beveled glass effect
  insetBevel: {
    blur: 1,
    spread: 0,
    color: 0xffffff,
    opacity: 0.08,
    inset: true,
  },
  // Deep drop shadow for elevation/depth
  elevationDeep: {
    blur: 30,
    spread: 0,
    color: 0x000000,
    opacity: 0.45,
  },
  // Gold glow for alerts/success
  goldAccent: {
    blur: 8,
    spread: 0,
    color: 0xf4c95d,
    opacity: 0.4,
  },
} as const;

/**
 * Stroke/border opacity values for Glass-metal aesthetic
 */
export const BORDER = {
  // Cyan edge lighting (button borders, element outlines)
  cyanDefault: {
    color: 0x00d4ff,
    opacity: 0.35,
  },
  cyanHover: {
    color: 0x00d4ff,
    opacity: 0.7,
  },
  cyanActive: {
    color: 0x00d4ff,
    opacity: 0.9,
  },
  // White subtle inner edge (glass beveling)
  whiteSubtle: {
    color: 0xffffff,
    opacity: 0.08,
  },
  // Gold accent border (premium elements)
  goldDefault: {
    color: 0xf4c95d,
    opacity: 0.4,
  },
} as const;

/**
 * Extract hex color as decimal for Phaser
 * Already provided above, but exposing calculation for reference
 */
export function hexToPhaser(hexString: string): number {
  return parseInt(hexString.replace('#', ''), 16);
}

/**
 * Convert PHASER hex (0xRRGGBB) to CSS hex string (#RRGGBB)
 */
export function phaserToCss(phaserHex: number): string {
  return '#' + phaserHex.toString(16).padStart(6, '0').toUpperCase();
}

/**
 * Create RGBA color string from Phaser hex + alpha
 * Useful for Phaser setAlpha or CSS fallbacks
 */
export function hexToRgba(phaserHex: number, alpha: number): string {
  const r = (phaserHex >> 16) & 0xff;
  const g = (phaserHex >> 8) & 0xff;
  const b = phaserHex & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

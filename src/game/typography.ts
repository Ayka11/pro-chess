/**
 * Premium Dark-Fantasy Tactical Interface Typography System
 * Spec: Cinzel for medieval prestige, Rajdhani/Inter Tight for tactical clarity, JetBrains Mono for stable digits
 * Font sizes scale across desktop/tablet/mobile breakpoints
 */

import * as Phaser from 'phaser';

/**
 * Font family selections with system fallbacks
 * These follow the spec but use system fonts for immediate availability
 */
export const FONT_FAMILY = {
  // Medieval prestige for titles and branding
  display: 'Cinzel, Georgia, "Times New Roman", serif',

  // Tactical clarity for UI and body text
  ui: 'Rajdhani, "Inter Tight", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',

  // Stable, readable monospace for timers and numeric displays
  mono: '"JetBrains Mono", "Monaco", "Courier New", monospace',

  // System fallbacks
  serif: 'Georgia, "Times New Roman", serif',
  sansSerif: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
} as const;

/**
 * Font size presets organized by context
 * Each preset includes desktop, tablet, and mobile sizes
 */
export const FONT_SIZE = {
  // Display/Title: Spec 56/64 desktop → 40/48 tablet → 32/40 mobile
  displayLarge: {
    desktop: 64,
    tablet: 48,
    mobile: 40,
  },
  displayMedium: {
    desktop: 56,
    tablet: 40,
    mobile: 32,
  },
  displaySmall: {
    desktop: 44,
    tablet: 32,
    mobile: 28,
  },

  // HUD Labels: Spec 12/16 uppercase with 0.08em tracking
  hudLabelLarge: {
    desktop: 16,
    tablet: 14,
    mobile: 12,
  },
  hudLabelMedium: {
    desktop: 14,
    tablet: 12,
    mobile: 11,
  },
  hudLabelSmall: {
    desktop: 12,
    tablet: 11,
    mobile: 10,
  },

  // Primary Values: Spec 20/24 medium to semibold (timers, counts, scores)
  valuePrimary: {
    desktop: 24,
    tablet: 20,
    mobile: 18,
  },
  valueSecondary: {
    desktop: 20,
    tablet: 18,
    mobile: 16,
  },

  // Body/UI text
  bodyLarge: {
    desktop: 18,
    tablet: 16,
    mobile: 14,
  },
  bodyMedium: {
    desktop: 16,
    tablet: 14,
    mobile: 13,
  },
  bodySmall: {
    desktop: 14,
    tablet: 13,
    mobile: 12,
  },

  // Button labels
  buttonLarge: {
    desktop: 20,
    tablet: 18,
    mobile: 16,
  },
  buttonMedium: {
    desktop: 16,
    tablet: 14,
    mobile: 13,
  },

  // Caption/helper text
  caption: {
    desktop: 12,
    tablet: 11,
    mobile: 10,
  },
} as const;

/**
 * Letter spacing in ems (device-agnostic units)
 * 1em = current font size, so 0.08em on 16px = ~1.28px visual spacing
 */
export const TRACKING = {
  tight: 0.02,        // Default UI, readable
  normal: 0.04,       // Standard spacing
  wide: 0.08,         // HUD labels (spec: 0.08em)
  regal: 0.12,        // Title lockup (regal-tech tone)
  extreme: 0.2,       // Special emphasis
} as const;

/**
 * Font weight presets
 */
export const FONT_WEIGHT = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extraBold: 800,
} as const;

/**
 * Complete text style objects for Phaser
 * Usage: scene.make.text({ style: TEXT_STYLE.menuTitle })
 */
export const TEXT_STYLE = {
  // === Menu & Title Context ===
  menuTitle: {
    fontFamily: FONT_FAMILY.display,
    fontSize: FONT_SIZE.displayLarge.desktop,
    fontStyle: 'normal',
    color: '#e6edf7',
    align: 'center',
    wordWrap: { width: 800, useAdvancedWrap: true },
  } as Phaser.Types.GameObjects.Text.TextStyle,

  menuSubtitle: {
    fontFamily: FONT_FAMILY.ui,
    fontSize: FONT_SIZE.bodyLarge.desktop,
    fontStyle: 'normal',
    color: '#a9b4c7',
    align: 'center',
  } as Phaser.Types.GameObjects.Text.TextStyle,

  // === Button Labels ===
  buttonPrimary: {
    fontFamily: FONT_FAMILY.ui,
    fontSize: FONT_SIZE.buttonLarge.desktop,
    fontStyle: 'normal',
    color: '#e6edf7',
    align: 'center',
    fontWeight: String(FONT_WEIGHT.semibold),
  } as Phaser.Types.GameObjects.Text.TextStyle,

  buttonSecondary: {
    fontFamily: FONT_FAMILY.ui,
    fontSize: FONT_SIZE.buttonMedium.desktop,
    fontStyle: 'normal',
    color: '#a9b4c7',
    align: 'center',
    fontWeight: String(FONT_WEIGHT.medium),
  } as Phaser.Types.GameObjects.Text.TextStyle,

  // === HUD Labels ===
  hudLabelUppercase: {
    fontFamily: FONT_FAMILY.ui,
    fontSize: FONT_SIZE.hudLabelLarge.desktop,
    fontStyle: 'normal',
    color: '#e6edf7',
    align: 'left',
    fontWeight: String(FONT_WEIGHT.semibold),
    // Note: Text transform to uppercase in rendering (Phaser doesn't have CSS text-transform)
  } as Phaser.Types.GameObjects.Text.TextStyle,

  // === Value Display (Timers, Counts) ===
  timerValue: {
    fontFamily: FONT_FAMILY.mono,
    fontSize: FONT_SIZE.valuePrimary.desktop,
    fontStyle: 'normal',
    color: '#f4c95d',
    align: 'center',
    fontWeight: String(FONT_WEIGHT.medium),
  } as Phaser.Types.GameObjects.Text.TextStyle,

  countsValue: {
    fontFamily: FONT_FAMILY.mono,
    fontSize: FONT_SIZE.valueSecondary.desktop,
    fontStyle: 'normal',
    color: '#e6edf7',
    align: 'center',
    fontWeight: String(FONT_WEIGHT.semibold),
  } as Phaser.Types.GameObjects.Text.TextStyle,

  // === General Body Text ===
  bodyDefault: {
    fontFamily: FONT_FAMILY.ui,
    fontSize: FONT_SIZE.bodyMedium.desktop,
    fontStyle: 'normal',
    color: '#e6edf7',
    align: 'left',
  } as Phaser.Types.GameObjects.Text.TextStyle,

  bodyDim: {
    fontFamily: FONT_FAMILY.ui,
    fontSize: FONT_SIZE.bodySmall.desktop,
    fontStyle: 'normal',
    color: '#a9b4c7',
    align: 'left',
  } as Phaser.Types.GameObjects.Text.TextStyle,

  // === Captions ===
  caption: {
    fontFamily: FONT_FAMILY.ui,
    fontSize: FONT_SIZE.caption.desktop,
    fontStyle: 'normal',
    color: '#a9b4c7',
    align: 'left',
  } as Phaser.Types.GameObjects.Text.TextStyle,

  // === Alerts & Special ===
  alertGold: {
    fontFamily: FONT_FAMILY.ui,
    fontSize: FONT_SIZE.hudLabelLarge.desktop,
    fontStyle: 'normal',
    color: '#f4c95d',
    align: 'center',
    fontWeight: String(FONT_WEIGHT.semibold),
  } as Phaser.Types.GameObjects.Text.TextStyle,

  alertDanger: {
    fontFamily: FONT_FAMILY.ui,
    fontSize: FONT_SIZE.hudLabelLarge.desktop,
    fontStyle: 'normal',
    color: '#ff5d73',
    align: 'center',
    fontWeight: String(FONT_WEIGHT.bold),
  } as Phaser.Types.GameObjects.Text.TextStyle,

  alertSuccess: {
    fontFamily: FONT_FAMILY.ui,
    fontSize: FONT_SIZE.hudLabelLarge.desktop,
    fontStyle: 'normal',
    color: '#5ee7a1',
    align: 'center',
    fontWeight: String(FONT_WEIGHT.semibold),
  } as Phaser.Types.GameObjects.Text.TextStyle,
} as const;

/**
 * Helper function: Get responsive font size based on viewport width
 * Breakpoint: 760px (compact flag from ProChessScene)
 */
export function getResponsiveFontSize(
  fontSizePreset: { desktop: number; tablet: number; mobile: number },
  viewportWidth: number,
  isMobileDevice: boolean = false
): number {
  if (isMobileDevice || viewportWidth < 600) {
    return fontSizePreset.mobile;
  }
  if (viewportWidth < 900) {
    return fontSizePreset.tablet;
  }
  return fontSizePreset.desktop;
}

/**
 * Helper function: Convert tracking (em) to pixel spacing at a given font size
 * Usage: if you need exact pixel values instead of em
 */
export function trackingToPixels(trackingEm: number, fontSizePx: number): number {
  return trackingEm * fontSizePx;
}

/**
 * Helper function: Create styled text object with Phaser compatibility
 */
export function createTextStyle(
  baseStyle: Phaser.Types.GameObjects.Text.TextStyle,
  overrides?: Partial<Phaser.Types.GameObjects.Text.TextStyle>
): Phaser.Types.GameObjects.Text.TextStyle {
  return { ...baseStyle, ...overrides };
}

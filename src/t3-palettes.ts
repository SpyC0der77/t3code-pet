// Pet dark surfaces stay neutral; the saved T3 palette supplies the accent identity.
function darkPalette(messageAction: string, messageActionHover: string) {
  return {
    canvas: '#181818', chrome: '#181818', surface: '#202020', surfaceOverlay: '#252525',
    text: '#e4e4e4', mutedForeground: '#b0b0b0', border: '#414141', input: '#808080',
    messageAction, messageActionForeground: '#181818', messageActionHover,
    accentSurface: '#323232', errorForeground: '#dfa09a',
  };
}

export const defaultUiPalette = {
  light: { canvas: '#fafafa', chrome: '#fafafa', surface: '#ffffff', surfaceOverlay: '#ffffff', text: '#27272a', mutedForeground: '#71717a', border: '#e4e4e7', input: '#d4d4d8', messageAction: '#725366', messageActionForeground: '#ffffff', messageActionHover: '#624657', accentSurface: '#f4f4f5', errorForeground: '#b91c1c' },
  dark: darkPalette('#b3a3c2', '#c0b1cf'),
};

// Light palette snapshot from T3 Code packages/shared/src/themePalettes.ts.
// Dark variants use restrained accents on shared charcoal surfaces.
export const palettes = {
  "t3-chat": {
    "light": {
      "canvas": "oklch(0.982446 0.010114 325.653)",
      "chrome": "oklch(0.982446 0.010114 325.653)",
      "surface": "oklch(0.971835 0.012884 321.894)",
      "surfaceOverlay": "oklch(1 0 0)",
      "text": "oklch(0.325698 0.116116 325.037)",
      "mutedForeground": "oklch(0.428932 0.163929 354.332)",
      "border": "oklch(0.923531 0.021247 328.096)",
      "input": "oklch(0.851713 0.055822 336.6)",
      "messageAction": "oklch(0.591646 0.217985 0.584)",
      "messageActionForeground": "oklch(1 0 0)",
      "messageActionHover": "oklch(0.539042 0.197866 0.305)",
      "accentSurface": "oklch(0.939552 0.024286 321.664)",
      "errorForeground": "oklch(0.458704 0.169677 3.815)"
    },
    "dark": darkPalette("#b5a6b1", "#c2b4be")
  },
  "grove": {
    "light": {
      "canvas": "oklch(0.972369 0.005497 157.15)",
      "chrome": "oklch(0.972369 0.005497 157.15)",
      "surface": "oklch(0.972369 0.005497 157.15)",
      "surfaceOverlay": "oklch(0.932695 0.003778 160.944)",
      "text": "oklch(0.222003 0.03479 328.979)",
      "mutedForeground": "oklch(0.527266 0.012309 320.683)",
      "border": "oklch(0.864831 0.01312 167.255)",
      "input": "oklch(0.829746 0.016084 168.234)",
      "messageAction": "oklch(0.535028 0.106403 77.549)",
      "messageActionForeground": "oklch(0.990339 0.008411 325.64)",
      "messageActionHover": "oklch(0.488753 0.096536 77.829)",
      "accentSurface": "oklch(0.909438 0.021521 164.612)",
      "errorForeground": "oklch(0.509494 0.208583 28.513)"
    },
    "dark": darkPalette("#a5b29a", "#b3bfa9")
  },
  "ocean": {
    "light": {
      "canvas": "oklch(0.974199 0.002856 241.597)",
      "chrome": "oklch(0.974199 0.002856 241.597)",
      "surface": "oklch(0.974199 0.002856 241.597)",
      "surfaceOverlay": "oklch(0.934442 0.003181 269.1)",
      "text": "oklch(0.222003 0.03479 328.979)",
      "mutedForeground": "oklch(0.528741 0.01828 313.823)",
      "border": "oklch(0.867646 0.013482 252.362)",
      "input": "oklch(0.832939 0.017389 252.598)",
      "messageAction": "oklch(0.493961 0.08175 201.584)",
      "messageActionForeground": "oklch(0.990339 0.008411 325.64)",
      "messageActionHover": "oklch(0.45151 0.074407 201.516)",
      "accentSurface": "oklch(0.91295 0.018827 241.836)",
      "errorForeground": "oklch(0.509494 0.208583 28.513)"
    },
    "dark": darkPalette("#a0b1ab", "#aebfb9")
  },
  "ember": {
    "light": {
      "canvas": "oklch(0.976527 0.002685 60.725)",
      "chrome": "oklch(0.976527 0.002685 60.725)",
      "surface": "oklch(0.976527 0.002685 60.725)",
      "surfaceOverlay": "oklch(0.936659 0.002879 29.96)",
      "text": "oklch(0.222003 0.03479 328.979)",
      "mutedForeground": "oklch(0.530413 0.018453 341.181)",
      "border": "oklch(0.870631 0.013204 39.431)",
      "input": "oklch(0.836213 0.017153 38.661)",
      "messageAction": "oklch(0.516323 0.161628 24.82)",
      "messageActionForeground": "oklch(0.990339 0.008411 325.64)",
      "messageActionHover": "oklch(0.471223 0.145843 24.688)",
      "accentSurface": "oklch(0.916502 0.01832 49.597)",
      "errorForeground": "oklch(0.509494 0.208583 28.513)"
    },
    "dark": darkPalette("#c2a18d", "#cfaf9b")
  },
  "iris": {
    "light": {
      "canvas": "oklch(0.976531 0.003855 303.226)",
      "chrome": "oklch(0.976531 0.003855 303.226)",
      "surface": "oklch(0.976531 0.003855 303.226)",
      "surfaceOverlay": "oklch(0.936665 0.005041 310.132)",
      "text": "oklch(0.222003 0.03479 328.979)",
      "mutedForeground": "oklch(0.529955 0.022319 321.556)",
      "border": "oklch(0.869608 0.018226 303.859)",
      "input": "oklch(0.834773 0.023405 303.676)",
      "messageAction": "oklch(0.516084 0.185229 340.776)",
      "messageActionForeground": "oklch(0.990339 0.008411 325.64)",
      "messageActionHover": "oklch(0.471003 0.16748 340.687)",
      "accentSurface": "oklch(0.914882 0.022965 299.986)",
      "errorForeground": "oklch(0.509494 0.208583 28.513)"
    },
    "dark": darkPalette("#b3a3c2", "#c0b1cf")
  }
} as const;

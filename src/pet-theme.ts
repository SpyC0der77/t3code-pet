import { resolveUiTheme, type UiTheme } from './t3-theme';

import type { PetThemeId, ThemeAppearance } from './theme-options';

export function resolvePetTheme(followed: UiTheme, choice: PetThemeId, appearance: ThemeAppearance, systemDark: boolean): UiTheme {
  if (choice === 'follow-t3-code') return followed;
  const theme = resolveUiTheme({
    't3code:theme': choice === 'default' ? appearance : choice,
    't3code:theme-appearance-mode': appearance,
  }, systemDark);
  return { ...theme, id: choice, fontFamily: followed.fontFamily, fontSize: followed.fontSize };
}

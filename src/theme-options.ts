export const themeChoices = [
  ['follow-t3-code', 'Follow T3 Code'], ['default', 'Default'], ['t3-chat', 'T3 Chat'],
  ['grove', 'Grove'], ['ocean', 'Ocean'], ['ember', 'Ember'], ['iris', 'Iris'],
] as const;
export type PetThemeId = typeof themeChoices[number][0];
export type ThemeAppearance = 'system' | 'light' | 'dark';

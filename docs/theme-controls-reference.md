# Theme controls source reference

Adapted from pingdotgg/t3code revision `00eb8f6183ba4b36a429db08767031ad8ca9d81d`.

- [ThemeSettings.tsx](https://github.com/pingdotgg/t3code/blob/00eb8f6183ba4b36a429db08767031ad8ca9d81d/apps/web/src/components/settings/ThemeSettings.tsx)
- [ThemeWireframe.tsx](https://github.com/pingdotgg/t3code/blob/00eb8f6183ba4b36a429db08767031ad8ca9d81d/apps/web/src/components/settings/ThemeWireframe.tsx)
- [ThemePreviewCircles.tsx](https://github.com/pingdotgg/t3code/blob/00eb8f6183ba4b36a429db08767031ad8ca9d81d/apps/web/src/components/settings/ThemePreviewCircles.tsx)
- [themePreview.ts](https://github.com/pingdotgg/t3code/blob/00eb8f6183ba4b36a429db08767031ad8ca9d81d/packages/shared/src/themePreview.ts)

The shared Pet component preserves the three mode tiles, the split System miniature, and paired light/dark style circles. It ports the percentage geometry and oklab preview blends to DOM/CSS rather than adding React. The miniature omits the orchestration panel, and tiles are smaller to fit the desktop dialog. Native radio inputs provide keyboard selection. The six bundled styles apply to both light and dark, with previews drawn from Pet's existing palette values. A separate checkbox preserves the default Follow T3 Code behavior. Selection remains a draft until Save or Continue.

Upstream copyright and MIT license are included in [T3-THEME-LICENSE.txt](T3-THEME-LICENSE.txt) and the packaged application.

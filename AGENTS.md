# Project instructions

Never start a development server unless the user explicitly asks. Build and package with the npm scripts; the application loads built local files.

Keep the pet separate from T3 Code. Its database connection must remain read-only. Never query credentials or message contents just to determine status. Provider names must not determine animation behavior.

Use simple, functional settings controls. Honor the user's Uncodixify instructions: no dashboard scaffolding, gradient/glass backgrounds, decorative headlines, excessive rounding, or transform-on-hover effects. The sprite's frame animation is part of the requested pet behavior.

Run `npm run check` and `npm test` for integration/state changes. Test the packaged Electron runtime when changing native capabilities, especially SQLite and window behavior. Do not claim cross-platform verification from a Windows run.

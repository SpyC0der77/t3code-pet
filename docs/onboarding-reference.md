# Onboarding source reference

The first-run UI follows T3 Code's `WelcomeWizard` and shared wizard components at upstream revision `094fb230e90ffb0af303a318ca716fecefd66c80`, inspected from a shallow clone on October 1, 2026.

- [WelcomeWizard.tsx](https://github.com/pingdotgg/t3code/blob/094fb230e90ffb0af303a318ca716fecefd66c80/apps/web/src/components/onboarding/WelcomeWizard.tsx)
- [ui/wizard.tsx](https://github.com/pingdotgg/t3code/blob/094fb230e90ffb0af303a318ca716fecefd66c80/apps/web/src/components/ui/wizard.tsx)

The pet uses the same 768px maximum width, identity above a segmented three-step progress control, 24px horizontal padding, 20px panel padding, 24px task titles, 14px body text, 20px step circles, 8px row/control corners, neutral panel backgrounds, outlined connection rows, collapsed connection configuration, and inline right-aligned primary actions with an arrow.

Pet-specific differences are deliberate. Its stages are Connect, Notifications, and Finish. The existing paw branding, bundled DM Sans, and lilac accent remain. A native companion window replaces T3 Code's workspace modal, so no duplicate backdrop or rounded outer dialog is drawn. Keep current notifications remains the default; migration still requires explicit native consent. Completed setup cannot navigate back into notification migration. The pet's sprite preview appears on the finish step.

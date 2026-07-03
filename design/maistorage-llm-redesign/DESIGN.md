# MaiStorage LLM Workspace Design System

## Brand Direction

MaiStorage is positioned as a Malaysia storage technology supplier with enterprise storage, aiDAPTIV+, automotive, and Phison group signals. The UI should feel like a serious storage/AI engineering console, not a generic chatbot or marketing page.

## Color System

- Primary navy: `#102B5C`
- Deep navy: `#071A36`
- Accent orange: `#FF981A`
- Accent orange dark: `#D87308`
- Ink: `#0B1630`
- Muted text: `#607089`
- Glass surface: `rgba(255, 255, 255, 0.72)`
- Glass surface strong: `rgba(255, 255, 255, 0.88)`
- Divider: `rgba(72, 91, 126, 0.18)`
- Background: `#F6F8FC`

Avoid purple AI gradients. Use navy, orange, silver, white, and blue-gray.

## Layout Principles

- Full app shell, not a landing page.
- Left command rail is the persistent navigation surface.
- Project workspace is the visual centerpiece.
- Chat composer floats as a glass capsule over the workspace.
- Cards and panels use 8px to 14px radii, depending on scale.
- Keep dense information readable; do not add oversized marketing copy.

## Glass Rules

- Use glass for app chrome, rail sections, source cards, composer, and modals.
- Glass must sit over a quiet background with enough contrast.
- Use one border and one shadow layer; avoid nested card-on-card styling.
- Keep text on glass at AA-friendly contrast.

## Motion Rules

- Use GSAP for entrance/reveal and small hover feedback.
- Use Lenis only on desktop when the user has not enabled reduced motion.
- Use WebGL only as a decorative background; the app must work if WebGL is disabled.
- Do not animate chat message text while the assistant is streaming.
- Respect `prefers-reduced-motion` everywhere.

## WebGL Direction

The background should suggest storage lanes, NAND traces, and AI data flow: small particles, slow lines, low opacity, and no distracting glow fields. Disable or heavily reduce on mobile.

## Accessibility

- All command buttons need labels or titles.
- Form controls keep native focus behavior.
- Interactive target height should stay at least 32px.
- Text must not overlap, clip, or require horizontal scrolling on mobile.
- Reduced motion mode disables Lenis, heavy GSAP transitions, and WebGL animation.

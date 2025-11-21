## UI Branding Guide

AnalyticsAssistant now shares the same look and feel as the marketing homepage. Use the guidelines below when building new surfaces so that the product and marketing site stay aligned.

### Design tokens

Tokens live in `web/styles/theme.css`. Key variables:

- `--aa-font-display`, `--aa-font-body` – Space Grotesk for hero/headlines, Inter for everything else.
- `--aa-color-bg`, `--aa-color-surface`, `--aa-color-surface-muted` – soft grey background with bright glassy cards.
- `--aa-primary`, `--aa-primary-dark`, `--aa-primary-soft` – blue accent for CTAs, pills, and highlights.
- `--aa-color-border`, `--aa-color-pill`, `--aa-color-pill-border` – subtle lines and pills.
- `--aa-r-card`, `--aa-r-pill` – radius scale (cards are 26‑28px, pills are fully rounded).
- `--aa-shadow-card`, `--aa-shadow-nav`, `--aa-cta-shadow` – elevation system for cards, nav, and CTAs.

Reference the variables via `var(--aa-...)` instead of hard-coding hex values. If you need a new token, add it to `theme.css` and document it here.

### Layout primitives

- `.aa-shell` – centers content at 1180px with responsive padding. Wrap all dashboard pages in this class instead of inline `maxWidth` rules.
- `.aa-nav`, `.aa-nav__inner`, `.aa-nav__logo`, `.aa-nav__cta` – sticky frosted nav bar that mirrors the marketing navigation.
- `.aa-hero*` – hero eyebrow, title, subtitle, and CTA styles (gradient headline, frosted actions, pill badges).
- `.aa-feature-callouts` – pill row used under the hero headline for capability call-outs.
- `.aa-button`, `.aa-button--primary`, `.aa-button--ghost` – CTA styles for marketing-consistent buttons if you need pure HTML buttons. The React `Button` helper in `pages/index.js` already consumes the same tokens.
- `.aa-badge`, `.aa-pill` – use for plan labels, filters, and inline metrics.
- `.aa-footer` – footer surface with Privacy/Terms requirements plus optional taglines.

### Cards and controls

- Use `FrostCard` (already updated) for analytics sections. It applies the frosted surface, 28px radius, and large drop shadow described above.
- Controls and form fields reuse the shared `controlFieldStyle` object in `pages/index.js`. For new fields, spread that style or copy the same values (18px radius, 12px padding, frosted background, subtle shadow).
- Date presets and pills now use pill styling with `var(--aa-primary-soft)` for active states. Match that pattern whenever you create segmented controls.

### CTAs and AI blocks

- Primary CTAs use `Button` with `kind="primaryCta"`; ghost buttons handle secondary actions (e.g., “See Premium Demo”).
- AI blocks already rely on the blue CTA variant. If you add new AI entry points, prefer `BlueAiButton` to stay on-brand.

### Footer + trust copy

- Keep Privacy/Terms links inside `.aa-footer`. You can add short trust statements (e.g., “Read-only, Google-verified connection”) here.

### Future work

- Any new page (admin, insights, premium flows) should import `theme.css` via `_app.js` and wrap in `.aa-shell`.
- When in doubt, inspect the marketing homepage: hero typography, glass cards, and pill badges should match 1‑1.


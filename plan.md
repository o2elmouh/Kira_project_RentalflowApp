# KiraFlow Landing — UX/UI Revamp Plan

**Scope:** `landing/` static site (kiraflow.ma). Goal: improve UX/UI **while keeping the existing color palette** (ink `#141413` / cream `#F3F0EE` / orange `#CF4500` / `#F37338`).
**Push policy:** all steps committed and pushed **together at the end** (one push), only on explicit instruction.

---

## Palette (locked — do not change)
| Token | Hex | Role |
|---|---|---|
| `--ink` / `--ink-soft` / `--ink-card` | `#141413` / `#1d1d1b` / `#232320` | backgrounds |
| `--cream` / `--muted` | `#F3F0EE` / `#a9a294` | text |
| `--orange` / `--orange-hover` / `--orange-light` | `#CF4500` / `#A83600` / `#F37338` | brand / accent |

---

## Progress

### ✅ Done (committed locally, not yet pushed)
- [x] **Step 1 — SVG feature icons** (#1): replaced emoji 📝🚗🤖📊👥🔒 with Lucide line icons in `--orange-light`.
- [x] **Step 2 — hero trust bar + closing CTA band** (#7, #6): `✓ Activation 24h · ✓ Sans engagement · ✓ Conforme Loi 09-08` under hero CTAs; "Prêt à digitaliser votre agence ?" band before footer. Both translated to AR.
- [x] **Step 3 — focus states + card hover + reduced-motion** (#8, #11, #12): keyboard focus rings; hover lift on feature/pricing cards; `prefers-reduced-motion` guard.
- [x] **Step 4 — visual polish**: subtle orange hero glow (radial behind headline) + alternating section background rhythm (`#screenshots`/`#faq` on `--ink-soft`) + floating WhatsApp button (orange, bottom-right).
- [x] **Step 5 — mobile nav + touch targets** (#9, #10): hamburger menu (☰/✕) with opaque dropdown for Fonctionnalités/Tarifs/FAQ/lang/login on mobile; lang toggle & footer links enlarged to ≥44px tap targets. JS toggle in `i18n.js`.

- [x] **Step 6 — CTA microcopy** (partial): added "Aucune carte bancaire requise pour démarrer." under hero CTAs (FR + AR). _WhatsApp number left as placeholder `212600000000` per user — fill later._

- [x] **Step 7 — social-proof band** (#5): stat strip (120+ / 15 000+ / 24h / 4,8/5) + 3 testimonial cards with star ratings after Features (FR + AR, RTL-safe; numbers forced LTR). _All copy is **placeholder** — swap in real stats/testimonials later._

### 🔄 In progress
- _(none — all no-asset UX/UI steps complete)_

### 🟠 To do (needs your input — left as placeholder)
- [ ] Replace social-proof stats + testimonials with real data.

### 🔵 Needs assets / data (deferred to a later session)
- [ ] **Webapp screenshots** (#2): real Dashboard / New Rental / Corbeille / Comptabilité captures for the empty `.frame` placeholders. *Blocked on demo data in the staging account ("LANDING CARS" is currently empty).*
- [ ] **`og:image`** (#4): add `landing/assets/og-image.png` (1200×630) — social shares currently show a broken preview.
- [ ] **Real pricing** (#3): replace `XXX MAD/mois` placeholders with real numbers or "Sur devis".

### 🐞 App-side issues flagged (separate from landing)
- [ ] Sidebar nav shows English ("Dashboard", "New Rental", "Restitution") — missing `fr` translations in the app's `common` namespace.

---

## Notes
- Verification: each step screenshotted in the local `landing` preview (`npx serve landing -l 4280`) before review.
- i18n: every new user-facing string added in FR (HTML) **and** AR (`landing/i18n.js`).

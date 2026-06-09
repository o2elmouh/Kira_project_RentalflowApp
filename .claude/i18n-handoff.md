# Arabic i18n Translation — Handoff

**Branch:** `staging-fix` (pushed to remote `staging`)
<<<<<<< HEAD
**Last commit:** `72c520f` — Phase 2: Restitution sub-steps (✅ complete)
**Worktree:** `C:\Users\otman\Downloads\Rental flow app SAAS\.claude\worktrees\blissful-taussig-0c023e`

---

## Goal

Translate every field/label in the app to Arabic without regression. ~5000 lines of UI, hundreds of strings. Split into 8 phases, one commit per phase.

---

## Regression-safety rules

1. **Add-only keys** — never rename existing keys; only add new ones. Old `t()` calls keep working.
2. **One namespace per page** — `settings.json`, `fleet.json`, `rental.json`, `restitution.json` already exist; reuse them. Add to `common.json` only for shared widgets.
3. **Preserve interpolations** — `{{name}}`, `{{count}}` placeholders copied verbatim across fr/ar/en.
4. **Build + tests after each phase** — `npx vite build` + `npx vitest run`; commit only on green.
5. **One commit per phase** — easy to revert any single phase if a regression surfaces.
6. **Don't touch logic** — only swap literal strings for `t(...)`. No refactors.
7. **Keep stored values in source language** — for dropdowns (fuel level, payment method) the stored value stays French so backend/PDF contracts keep working; only displayed label is translated.
8. **Multi-namespace when needed** — `useTranslation(['rental', 'common'])` and prefix `common:` / `rental:` to access cross-namespace keys.

---

## Phase status

| # | Phase | Files | Status | Commit |
|---|---|---|---|---|
| 1 | NewRental sub-steps | `pages/rental/ScanStep.jsx`, `RentalStep.jsx`, `PhotoStep.jsx` | ✅ done | `697f80e` |
| 2 | Restitution sub-steps | `pages/restitution/Step1Return.jsx`, `Step2Photos.jsx`, `Step3Damages.jsx`, `Step4Closure.jsx` | ✅ done | `72c520f` |
| 3 | Settings sub-tabs body | `pages/settings/AgenceTab.jsx` (body), `GeneralConfigTab.jsx`, `FleetConfigTab.jsx` (body), `TeamTab.jsx`, `IntegrationsTab.jsx`, `TelematicsTab.jsx`, `RentalOptionsSection.jsx`, `SignatureSection.jsx` | ⏳ pending | — |
| 4 | Fleet sub-pages | `pages/fleet/VehicleEditForm.jsx`, `VehicleDetail.jsx`, `RentalsTab.jsx`, `RepairsTab.jsx`, `DeadlinesTab.jsx`, `AmortissementTab.jsx`, `InlineRepairsSection.jsx`, `ReferencePhotosSection.jsx` | ⏳ pending | — |
| 5 | Documents internals | `pages/Contracts.jsx`, `Invoices.jsx`, `pages/accounting/TabDashboard.jsx`, `TabPlanComptable.jsx`, `TabJournal.jsx`, `TabDeposits.jsx`, the `TabBilan` inline component in `pages/Accounting.jsx` | ⏳ pending | — |
| 6 | Basket internals | `components/LeadModal.jsx`, `components/AlertSection.jsx`, `LeadCard` inside `pages/Basket.jsx`, `STATUS_LABELS` mapping | ⏳ pending | — |
| 7 | Network internals | `pages/Network.jsx` (lines after the header — outbound/inbound tabs, dashboards) | ⏳ pending | — |
| 8 | Misc pages | `pages/Auth.jsx`, `Onboarding.jsx`, `Clients.jsx`, `ContractSuccess.jsx`, `WelcomeScreen.jsx`, `SignContract.jsx` | ⏳ pending | — |

---

## What's left intentionally untranslated

- **Embedded PDF contract preview in `ContractStep.jsx`** — the contract is the legal Moroccan template; clauses must stay French for legal validity. Translation of the contract template is a separate business/legal decision, not a UI fix.
- **Stored enum values** (fuel level, payment method, status strings used in DB) — only their labels are translated; values remain French for backend compatibility.

---

## Locale files reference

```
public/locales/{fr,ar,en}/
  ├── common.json       — shared widgets, nav, status, calendar, pages.{accounting,network,basket,newRental}
  ├── auth.json
  ├── clients.json
  ├── contracts.json
  ├── dashboard.json
  ├── fleet.json
  ├── invoices.json
  ├── onboarding.json
  ├── rental.json       — NEW (Phase 1): scanStep.*, rentalStep.*, photoStep.*
  ├── reservations.json
  ├── restitution.json
  └── settings.json
```

---

## How each phase was wired (pattern to reuse)

1. **Inventory strings** — grep the target file for hardcoded French text (`grep -nE ">[A-Z][A-Za-zéè…]+<" path`).
2. **Add keys to {fr,ar,en}/<ns>.json** — write a Python script in `.claude/tmp_*.py` that merges new keys without overwriting existing ones; run it.
3. **Wire the component**:
   - Add `import { useTranslation } from 'react-i18next'`
   - Add `const { t } = useTranslation('<ns>')` inside the component
   - Replace literal strings with `{t('...')}` calls
   - For multi-ns: `useTranslation(['rental','common'])` then `t('rental:key')` / `t('common:key')`
4. **Verify** — `npx vite build` (must be ✓ built) then `npx vitest run`.
5. **Commit** — atomic commit titled `i18n(ar) phase N: <area> — <files>`, push to `staging-fix:staging`.

---

## Known gotchas

- The Bash `Read`/heredoc combo with embedded quotes blows up. Use `Write` to drop a `.claude/tmp_*.py` script and `python3` to run it.
- The Edit tool sometimes errors with "File has not been read yet" after long sessions; force-read with `Read offset/limit` or use `sed`/Python via Bash.
- `graphify` post-commit hook rebuilds `graphify-out/` — never `git add graphify-out/`.
- Pre-existing 7 vitest suite-load failures (Node `node:test` import incompat) — ignore, they're not caused by i18n changes.

---

## Resume command for next session

> "Continue the Arabic i18n work. Read `.claude/i18n-handoff.md` for context. Start Phase 3 (Settings sub-tabs). Follow the regression-safety rules. Commit atomically and push to `staging-fix:staging`."

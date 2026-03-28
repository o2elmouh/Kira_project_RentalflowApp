# RentaFlow 🚗
**Car Rental Management SaaS — Morocco**

Auto-generate legally compliant contracts & invoices for Moroccan car rental agencies.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run dev server
npm run dev

# 3. Open in browser
# http://localhost:5173
```

---

## Features

| Module | Description |
|---|---|
| **ID Scan** | Upload CIN / passport / driving license → OCR extracts fields automatically |
| **New Rental Wizard** | 4-step flow: scan → rental details → contract → invoice |
| **Contract Generation** | Legally compliant PDF contract (FR) with all required Moroccan clauses |
| **Invoice Generation** | Auto-calculated PDF invoice (TTC, TVA 20%, line items) |
| **Fleet Management** | Vehicle CRUD, availability search, status tracking |
| **Client Database** | History, search, CNDP-compliant storage (5yr retention) |
| **Dashboard** | Active rentals, fleet status, revenue overview |

---

## Legal Compliance (Morocco)

All generated contracts include:
- ✅ Parties identification (loueur + locataire)
- ✅ Vehicle details + état des lieux reference
- ✅ Rental duration (24h tranches)
- ✅ Insurance clauses (RC, PAI, CDW, franchise)
- ✅ Accident reporting obligations (24h/48h)
- ✅ Territorial restriction (Morocco only)
- ✅ Liability clauses (fines, contraventions)
- ✅ CNDP / Loi 09-08 data protection clause
- ✅ Jurisdiction clause (tribunaux marocains)
- ✅ Signature blocks (loueur + locataire)

---

## Project Structure

```
src/
├── components/
│   └── Sidebar.jsx          # Navigation
├── pages/
│   ├── Dashboard.jsx        # Overview & stats
│   ├── NewRental.jsx        # 4-step rental wizard
│   ├── Fleet.jsx            # Vehicle management
│   └── OtherPages.jsx       # Clients, Contracts, Invoices, Settings
├── utils/
│   ├── storage.js           # LocalStorage data layer
│   └── pdf.js               # PDF generation (contract + invoice)
├── App.jsx                  # Root + routing
├── main.jsx                 # Entry point
└── index.css                # Global styles
```

---

## Next Steps (Production Roadmap)

- [ ] **Real OCR** — integrate Tesseract.js or a Moroccan ID OCR API
- [ ] **Backend** — migrate from LocalStorage to Supabase/PostgreSQL
- [ ] **Arabic contract** — bilingual FR/AR template
- [ ] **CNDP declaration** — file formal data processing declaration
- [ ] **Digital signature** — e-signature pad integration
- [ ] **WhatsApp/SMS** — send contract PDF to client
- [ ] **Multi-agency** — SaaS multi-tenant support
- [ ] **Offline mode** — PWA for low connectivity areas

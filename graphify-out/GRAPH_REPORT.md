# Graph Report - .  (2026-05-13)

> **Manual edits since last full regen (2026-05-15, v1.10.7 — Law 09-08 Phase 5b):**
> - REMOVED from `lib/db.js`: `getClients()`, `getClient(id)`, `saveClient()`, `deleteClient(id)`, plus the `clientToDb`/`clientFromDb` mappers. Replaced by the `/clients` API consumed via `lib/api.js`.
> - RENAMED in `lib/api.js`: `getClientsApi`/`getClientApi`/`saveClientApi`/`patchClientApi`/`deleteClientApi` → drop the `Api` suffix.
> - MODIFIED call sites — all 6 frontend modules that previously imported client CRUD from `lib/db`: `pages/Clients.jsx`, `pages/Dashboard.jsx`, `pages/Contracts.jsx`, `pages/Invoices.jsx`, `pages/ContractSuccess.jsx`, `pages/rental/ContractStep.jsx`. They now import `{ api }` and call `api.getClients()` etc.
>
> **Manual edits since last full regen (2026-05-15, v1.10.6 — Law 09-08 Phase 5a):**
> - NEW `server/lib/encryption.js` exports `encrypt(text)`, `decrypt(blob)`, `isEncryptionConfigured()`, `isEncryptedBlob(value)`. Lazy key resolution so tests can mutate `ENCRYPTION_KEY` per case.
> - NEW `server/routes/clients.js` — GET/GET:id/POST/PATCH/DELETE for `/clients`. Mirrors the pre-Phase-5 `lib/db.js` JSON shape. `ENCRYPT_PII=true` toggles between plaintext and `*_enc` columns.
> - NEW `server/scripts/migrateClientsEncryption.js` `migrateClientsEncryption(db?)` — paginated, idempotent backfill. Returns `{processed, encrypted, skipped, nullified}`.
> - NEW migration `20260515b_clients_encrypt.sql` adds `id_number_enc`, `driving_license_num_enc`, `date_of_birth_enc` text columns.
> - MODIFIED `server/routes/leads.js` — encryption helpers removed, now imported (and re-exported) from `server/lib/encryption.js`.
> - MODIFIED `server/lib/anonymize.js` — also nulls `*_enc` columns so erasure stays complete regardless of `ENCRYPT_PII` state.
> - MODIFIED `server/index.js` — mounts `/clients` route.
> - MODIFIED `lib/api.js` — new methods `getClientsApi`, `getClientApi`, `saveClientApi`, `patchClientApi`, `deleteClientApi` (Phase 5b will switch frontend imports to use them).
>
> **Manual edits since last full regen (2026-05-15, v1.10.5 — Law 09-08 Phase 4):**
> - NEW `server/lib/anonymize.js` `anonymizeClient({ clientId, agencyId, actorUserId, action, reason, metadata, db })` — shared helper for manual + automated anonymization. Writes `clients` row + `audit_log` row. Idempotent (`skipped` on already-anonymized).
> - NEW `server/scripts/enforceRetention.js` `enforceRetention(db?)` — monthly cron entry point. Iterates agencies, picks oldest admin as actor, anonymizes clients whose contracts are all closed past `agency.retention_years`.
> - NEW `supabase/migrations/20260515_agencies_retention.sql` — adds `agencies.retention_years int DEFAULT 10 CHECK 5-30`.
> - MODIFIED `server/routes/admin.js` — now calls `anonymizeClient` helper instead of inlining the update + audit logic.
> - MODIFIED `server/routes/agency.js` — PATCH whitelist includes `retention_years`, 5-30 validation returns 400.
> - MODIFIED `pages/settings/PrivacyTab.jsx` — new retention-period input + Save button, wired to `api.updateAgency`.
> - MODIFIED `server/index.js` — new monthly cron schedule `30 4 1 * *` for `enforceRetention`.
>
> **Manual edits since last full regen (2026-05-14, v1.10.4):**
> - `lib/db.js` `getAgencyId()` rewritten — now uses `supabase.auth.getSession()` (no network) with a module-scope cache keyed by user_id, invalidated via `onAuthStateChange(SIGNED_OUT|USER_UPDATED)`. Removes ~600-1000 ms latency from every db.js call.
> - `pages/SignContract.jsx` — `drawing` and `hasStrokes` flags moved from `useState` to `useRef` during the canvas drag; React state only flips on `stopDraw`. Fixes signature-disappears-on-release bug.
> - `src/hooks/useScannerFlow.ts` — added `simulateScan(type)` that injects mock CIN/licence data without an OCR API call (zero token cost).
> - `pages/rental/ScanStep.jsx` — added always-visible "🧪 Simuler scan CIN/permis" buttons.
> - Run `/graphify` to do a full regen at convenience.


## Corpus Check
- 166 files · ~1,498,084 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 632 nodes · 798 edges · 131 communities detected
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 70 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 87|Community 87]]
- [[_COMMUNITY_Community 88|Community 88]]
- [[_COMMUNITY_Community 89|Community 89]]
- [[_COMMUNITY_Community 90|Community 90]]
- [[_COMMUNITY_Community 91|Community 91]]
- [[_COMMUNITY_Community 92|Community 92]]
- [[_COMMUNITY_Community 93|Community 93]]
- [[_COMMUNITY_Community 94|Community 94]]
- [[_COMMUNITY_Community 95|Community 95]]
- [[_COMMUNITY_Community 96|Community 96]]
- [[_COMMUNITY_Community 97|Community 97]]
- [[_COMMUNITY_Community 98|Community 98]]
- [[_COMMUNITY_Community 99|Community 99]]
- [[_COMMUNITY_Community 100|Community 100]]
- [[_COMMUNITY_Community 101|Community 101]]
- [[_COMMUNITY_Community 102|Community 102]]
- [[_COMMUNITY_Community 103|Community 103]]
- [[_COMMUNITY_Community 104|Community 104]]
- [[_COMMUNITY_Community 105|Community 105]]
- [[_COMMUNITY_Community 106|Community 106]]
- [[_COMMUNITY_Community 107|Community 107]]
- [[_COMMUNITY_Community 108|Community 108]]
- [[_COMMUNITY_Community 109|Community 109]]
- [[_COMMUNITY_Community 110|Community 110]]
- [[_COMMUNITY_Community 111|Community 111]]
- [[_COMMUNITY_Community 112|Community 112]]
- [[_COMMUNITY_Community 113|Community 113]]
- [[_COMMUNITY_Community 114|Community 114]]
- [[_COMMUNITY_Community 115|Community 115]]
- [[_COMMUNITY_Community 116|Community 116]]
- [[_COMMUNITY_Community 117|Community 117]]
- [[_COMMUNITY_Community 118|Community 118]]
- [[_COMMUNITY_Community 119|Community 119]]
- [[_COMMUNITY_Community 120|Community 120]]
- [[_COMMUNITY_Community 121|Community 121]]
- [[_COMMUNITY_Community 122|Community 122]]
- [[_COMMUNITY_Community 123|Community 123]]
- [[_COMMUNITY_Community 124|Community 124]]
- [[_COMMUNITY_Community 125|Community 125]]
- [[_COMMUNITY_Community 126|Community 126]]
- [[_COMMUNITY_Community 127|Community 127]]
- [[_COMMUNITY_Community 128|Community 128]]
- [[_COMMUNITY_Community 129|Community 129]]
- [[_COMMUNITY_Community 130|Community 130]]

## God Nodes (most connected - your core abstractions)
1. `read()` - 37 edges
2. `getAgencyId()` - 21 edges
3. `write()` - 20 edges
4. `sbSelect()` - 17 edges
5. `sbUpsert()` - 14 edges
6. `handleInboundWhatsApp()` - 11 edges
7. `uid()` - 11 edges
8. `handleInboundWhatsApp()` - 9 edges
9. `displayPlate()` - 8 edges
10. `generateContract()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `saveClientSignature()` --calls--> `updateContract()`  [INFERRED]
  lib\signing.js → utils\storage.js
- `Contracts()` --calls--> `getClient()`  [INFERRED]
  pages\Contracts.jsx → utils\storage.js
- `Contracts()` --calls--> `getVehicle()`  [INFERRED]
  pages\Contracts.jsx → utils\storage.js
- `autoFillMaintenance()` --calls--> `getFleetConfigForMake()`  [INFERRED]
  pages\Fleet.jsx → utils\storage.js
- `fmt()` --calls--> `AgedReceivablesView()`  [INFERRED]
  pages\accounting\accountingStyles.js → pages\accounting\AgedReceivablesView.jsx

## Communities

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (70): requireAuth(), addRepair(), clientFromDb(), clientToDb(), contractFromDb(), contractToDb(), deleteClient(), deleteRepair() (+62 more)

### Community 1 - "Community 1"
Cohesion: 0.09
Nodes (50): computeAgencyPayout(), computePL(), generateRentalInvoice(), getAccountByCode(), holdDeposit(), postTransaction(), releaseDeposit(), deleteClient() (+42 more)

### Community 2 - "Community 2"
Cohesion: 0.11
Nodes (27): classifyTextMessage(), extractWithClaude(), findMatchingDemand(), getClient(), getClientStatus(), handleInboundWhatsApp(), levenshtein(), nameMatchScore() (+19 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (17): AgenceTab(), NewRental(), Field(), Field(), ReservationDetailsPanel(), Reservations(), Settings(), TeamTab() (+9 more)

### Community 4 - "Community 4"
Cohesion: 0.23
Nodes (19): amountInWords(), belowHundred(), belowThousand(), _buildContractDoc(), _buildInvoiceDoc(), displayPlate(), drawCarDiagram(), drawFuelGauge() (+11 more)

### Community 5 - "Community 5"
Cohesion: 0.13
Nodes (9): computeDeadlinesFromConfig(), displayPlate(), parsePlate(), DeadlinesTab(), autoFillMaintenance(), PlateInput(), getFleetConfig(), getFleetConfigForMake() (+1 more)

### Community 6 - "Community 6"
Cohesion: 0.18
Nodes (9): generateRestitutionPDF(), Restitution(), computeExtraFees(), daysBetween(), fmtDate(), nowTime(), today(), Step3Damages() (+1 more)

### Community 7 - "Community 7"
Cohesion: 0.2
Nodes (7): Basket(), formatSenderId(), LeadCard(), CONF_COLOR(), ConfBadge(), LeadModal(), useLeads()

### Community 8 - "Community 8"
Cohesion: 0.17
Nodes (5): fmt(), AgedReceivablesView(), PnLView(), TabDeposits(), TabJournal()

### Community 9 - "Community 9"
Cohesion: 0.2
Nodes (7): detectIdentityMismatch(), normalizeName(), ScanStep(), normalize(), mapToClientFields(), resolveNationality(), useScannerFlow()

### Community 10 - "Community 10"
Cohesion: 0.27
Nodes (8): getAuthHeaders(), getSession(), authHeaders(), buildQuery(), createReservation(), fetchReservationById(), fetchReservations(), updateReservation()

### Community 11 - "Community 11"
Cohesion: 0.44
Nodes (7): clearDrafts(), deleteDraft(), getDraft(), getStorageKey(), loadDrafts(), safeParse(), saveDraft()

### Community 12 - "Community 12"
Cohesion: 0.28
Nodes (4): Calendar(), daysInMonth(), getDays(), periodLabel()

### Community 13 - "Community 13"
Cohesion: 0.25
Nodes (0): 

### Community 14 - "Community 14"
Cohesion: 0.46
Nodes (6): createSigningToken(), getContractForToken(), loadTokens(), saveClientSignature(), saveTokens(), getContracts()

### Community 15 - "Community 15"
Cohesion: 0.39
Nodes (5): Contracts(), daysBetween(), fmtDate(), statusBadgeClass(), statusLabel()

### Community 16 - "Community 16"
Cohesion: 0.25
Nodes (3): QB, pollAgency(), decrypt()

### Community 17 - "Community 17"
Cohesion: 0.62
Nodes (6): capitalise(), normaliseDate(), parseCIN(), parseLicence(), parseMRZ(), runOCR()

### Community 18 - "Community 18"
Cohesion: 0.29
Nodes (0): 

### Community 19 - "Community 19"
Cohesion: 0.33
Nodes (0): 

### Community 20 - "Community 20"
Cohesion: 0.33
Nodes (0): 

### Community 21 - "Community 21"
Cohesion: 0.53
Nodes (4): appendAgencyTemplate(), httpError(), loadPdfLib(), prepareSignableContract()

### Community 22 - "Community 22"
Cohesion: 0.47
Nodes (4): appendConversation(), analyzeQuoteReply(), getClient(), handleQuoteReply()

### Community 23 - "Community 23"
Cohesion: 0.33
Nodes (0): 

### Community 24 - "Community 24"
Cohesion: 0.33
Nodes (2): autoFillMaintenance(), getDefaultConfigForMake()

### Community 25 - "Community 25"
Cohesion: 0.33
Nodes (0): 

### Community 26 - "Community 26"
Cohesion: 0.5
Nodes (2): fmtDate(), SignContract()

### Community 27 - "Community 27"
Cohesion: 0.4
Nodes (1): QB

### Community 28 - "Community 28"
Cohesion: 0.5
Nodes (2): toMaskedCarDTO(), toRevealedCarDTO()

### Community 29 - "Community 29"
Cohesion: 0.5
Nodes (2): traccarAuth(), traccarFetch()

### Community 30 - "Community 30"
Cohesion: 0.4
Nodes (0): 

### Community 31 - "Community 31"
Cohesion: 0.6
Nodes (2): ClaudeScannerService, getAuthToken()

### Community 32 - "Community 32"
Cohesion: 0.6
Nodes (3): checkClientDocumentExpiry(), checkDocumentExpiry(), isDateExpired()

### Community 33 - "Community 33"
Cohesion: 0.83
Nodes (3): AlertCard(), formatSenderId(), timeAgo()

### Community 34 - "Community 34"
Cohesion: 0.5
Nodes (0): 

### Community 35 - "Community 35"
Cohesion: 0.5
Nodes (0): 

### Community 36 - "Community 36"
Cohesion: 0.67
Nodes (2): getCarPos(), WelcomeScreen()

### Community 37 - "Community 37"
Cohesion: 0.5
Nodes (0): 

### Community 38 - "Community 38"
Cohesion: 0.67
Nodes (0): 

### Community 39 - "Community 39"
Cohesion: 0.67
Nodes (0): 

### Community 40 - "Community 40"
Cohesion: 0.67
Nodes (0): 

### Community 41 - "Community 41"
Cohesion: 1.0
Nodes (2): main(), seedForAgency()

### Community 42 - "Community 42"
Cohesion: 1.0
Nodes (2): formatWhatsAppNumber(), sendWhatsAppMessage()

### Community 43 - "Community 43"
Cohesion: 0.67
Nodes (1): MockScannerService

### Community 44 - "Community 44"
Cohesion: 0.67
Nodes (0): 

### Community 45 - "Community 45"
Cohesion: 0.67
Nodes (0): 

### Community 46 - "Community 46"
Cohesion: 0.67
Nodes (0): 

### Community 47 - "Community 47"
Cohesion: 1.0
Nodes (0): 

### Community 48 - "Community 48"
Cohesion: 1.0
Nodes (0): 

### Community 49 - "Community 49"
Cohesion: 1.0
Nodes (0): 

### Community 50 - "Community 50"
Cohesion: 1.0
Nodes (0): 

### Community 51 - "Community 51"
Cohesion: 1.0
Nodes (0): 

### Community 52 - "Community 52"
Cohesion: 1.0
Nodes (0): 

### Community 53 - "Community 53"
Cohesion: 1.0
Nodes (0): 

### Community 54 - "Community 54"
Cohesion: 1.0
Nodes (0): 

### Community 55 - "Community 55"
Cohesion: 1.0
Nodes (0): 

### Community 56 - "Community 56"
Cohesion: 1.0
Nodes (0): 

### Community 57 - "Community 57"
Cohesion: 1.0
Nodes (0): 

### Community 58 - "Community 58"
Cohesion: 1.0
Nodes (0): 

### Community 59 - "Community 59"
Cohesion: 1.0
Nodes (0): 

### Community 60 - "Community 60"
Cohesion: 1.0
Nodes (0): 

### Community 61 - "Community 61"
Cohesion: 1.0
Nodes (0): 

### Community 62 - "Community 62"
Cohesion: 1.0
Nodes (0): 

### Community 63 - "Community 63"
Cohesion: 1.0
Nodes (0): 

### Community 64 - "Community 64"
Cohesion: 1.0
Nodes (0): 

### Community 65 - "Community 65"
Cohesion: 1.0
Nodes (0): 

### Community 66 - "Community 66"
Cohesion: 1.0
Nodes (0): 

### Community 67 - "Community 67"
Cohesion: 1.0
Nodes (0): 

### Community 68 - "Community 68"
Cohesion: 1.0
Nodes (0): 

### Community 69 - "Community 69"
Cohesion: 1.0
Nodes (0): 

### Community 70 - "Community 70"
Cohesion: 1.0
Nodes (0): 

### Community 71 - "Community 71"
Cohesion: 1.0
Nodes (0): 

### Community 72 - "Community 72"
Cohesion: 1.0
Nodes (0): 

### Community 73 - "Community 73"
Cohesion: 1.0
Nodes (0): 

### Community 74 - "Community 74"
Cohesion: 1.0
Nodes (0): 

### Community 75 - "Community 75"
Cohesion: 1.0
Nodes (0): 

### Community 76 - "Community 76"
Cohesion: 1.0
Nodes (0): 

### Community 77 - "Community 77"
Cohesion: 1.0
Nodes (0): 

### Community 78 - "Community 78"
Cohesion: 1.0
Nodes (0): 

### Community 79 - "Community 79"
Cohesion: 1.0
Nodes (0): 

### Community 80 - "Community 80"
Cohesion: 1.0
Nodes (0): 

### Community 81 - "Community 81"
Cohesion: 1.0
Nodes (0): 

### Community 82 - "Community 82"
Cohesion: 1.0
Nodes (0): 

### Community 83 - "Community 83"
Cohesion: 1.0
Nodes (0): 

### Community 84 - "Community 84"
Cohesion: 1.0
Nodes (0): 

### Community 85 - "Community 85"
Cohesion: 1.0
Nodes (0): 

### Community 86 - "Community 86"
Cohesion: 1.0
Nodes (0): 

### Community 87 - "Community 87"
Cohesion: 1.0
Nodes (0): 

### Community 88 - "Community 88"
Cohesion: 1.0
Nodes (0): 

### Community 89 - "Community 89"
Cohesion: 1.0
Nodes (0): 

### Community 90 - "Community 90"
Cohesion: 1.0
Nodes (0): 

### Community 91 - "Community 91"
Cohesion: 1.0
Nodes (0): 

### Community 92 - "Community 92"
Cohesion: 1.0
Nodes (0): 

### Community 93 - "Community 93"
Cohesion: 1.0
Nodes (0): 

### Community 94 - "Community 94"
Cohesion: 1.0
Nodes (0): 

### Community 95 - "Community 95"
Cohesion: 1.0
Nodes (0): 

### Community 96 - "Community 96"
Cohesion: 1.0
Nodes (0): 

### Community 97 - "Community 97"
Cohesion: 1.0
Nodes (0): 

### Community 98 - "Community 98"
Cohesion: 1.0
Nodes (0): 

### Community 99 - "Community 99"
Cohesion: 1.0
Nodes (0): 

### Community 100 - "Community 100"
Cohesion: 1.0
Nodes (0): 

### Community 101 - "Community 101"
Cohesion: 1.0
Nodes (0): 

### Community 102 - "Community 102"
Cohesion: 1.0
Nodes (0): 

### Community 103 - "Community 103"
Cohesion: 1.0
Nodes (0): 

### Community 104 - "Community 104"
Cohesion: 1.0
Nodes (0): 

### Community 105 - "Community 105"
Cohesion: 1.0
Nodes (0): 

### Community 106 - "Community 106"
Cohesion: 1.0
Nodes (0): 

### Community 107 - "Community 107"
Cohesion: 1.0
Nodes (0): 

### Community 108 - "Community 108"
Cohesion: 1.0
Nodes (0): 

### Community 109 - "Community 109"
Cohesion: 1.0
Nodes (0): 

### Community 110 - "Community 110"
Cohesion: 1.0
Nodes (0): 

### Community 111 - "Community 111"
Cohesion: 1.0
Nodes (0): 

### Community 112 - "Community 112"
Cohesion: 1.0
Nodes (0): 

### Community 113 - "Community 113"
Cohesion: 1.0
Nodes (0): 

### Community 114 - "Community 114"
Cohesion: 1.0
Nodes (0): 

### Community 115 - "Community 115"
Cohesion: 1.0
Nodes (0): 

### Community 116 - "Community 116"
Cohesion: 1.0
Nodes (0): 

### Community 117 - "Community 117"
Cohesion: 1.0
Nodes (0): 

### Community 118 - "Community 118"
Cohesion: 1.0
Nodes (0): 

### Community 119 - "Community 119"
Cohesion: 1.0
Nodes (0): 

### Community 120 - "Community 120"
Cohesion: 1.0
Nodes (0): 

### Community 121 - "Community 121"
Cohesion: 1.0
Nodes (0): 

### Community 122 - "Community 122"
Cohesion: 1.0
Nodes (0): 

### Community 123 - "Community 123"
Cohesion: 1.0
Nodes (0): 

### Community 124 - "Community 124"
Cohesion: 1.0
Nodes (0): 

### Community 125 - "Community 125"
Cohesion: 1.0
Nodes (0): 

### Community 126 - "Community 126"
Cohesion: 1.0
Nodes (0): 

### Community 127 - "Community 127"
Cohesion: 1.0
Nodes (0): 

### Community 128 - "Community 128"
Cohesion: 1.0
Nodes (0): 

### Community 129 - "Community 129"
Cohesion: 1.0
Nodes (0): 

### Community 130 - "Community 130"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **Thin community `Community 47`** (2 nodes): `App()`, `App.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (2 nodes): `AlertSection()`, `AlertSection.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (2 nodes): `DocumentExpiryAlert.jsx`, `DocumentExpiryAlert()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (2 nodes): `DocumentMismatchModal.jsx`, `DocumentMismatchModal()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (2 nodes): `LanguageSelector.jsx`, `LanguageSelector()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (2 nodes): `Sidebar.jsx`, `Sidebar()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (2 nodes): `SmartQuotePanel.jsx`, `SmartQuotePanel()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (2 nodes): `applyDirection()`, `i18n.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (2 nodes): `ContractSuccess()`, `ContractSuccess.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (2 nodes): `Documents()`, `Documents.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (2 nodes): `Invoices()`, `Invoices.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (2 nodes): `RestitutionPicker.jsx`, `RestitutionPicker()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 59`** (2 nodes): `BarChart()`, `BarChart.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 60`** (2 nodes): `KpiCard()`, `KpiCard.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 61`** (2 nodes): `Modal()`, `Modal.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 62`** (2 nodes): `TabDashboard.jsx`, `TabDashboard()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 63`** (2 nodes): `TabPlanComptable.jsx`, `TabPlanComptable()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 64`** (2 nodes): `UtilizationView.jsx`, `UtilizationView()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 65`** (2 nodes): `AmortissementTab()`, `AmortissementTab.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 66`** (2 nodes): `DeadlineBadge()`, `DeadlineBadge.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 67`** (2 nodes): `InlineRepairsSection()`, `InlineRepairsSection.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 68`** (2 nodes): `ReferencePhotosSection.jsx`, `ReferencePhotosSection()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 69`** (2 nodes): `RentalsTab.jsx`, `RentalsTab()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 70`** (2 nodes): `RepairsTab.jsx`, `RepairsTab()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 71`** (2 nodes): `VehicleEditForm.jsx`, `VehicleEditForm()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 72`** (2 nodes): `CarDiagram()`, `CarDiagram.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 73`** (2 nodes): `ClientAlerts()`, `ClientAlerts.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 74`** (2 nodes): `PhotoStep.jsx`, `PhotoStep()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 75`** (2 nodes): `RentalStep.jsx`, `RentalStep()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 76`** (2 nodes): `StepBar.jsx`, `StepBar()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 77`** (2 nodes): `StepButtons.jsx`, `StepButtons()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 78`** (2 nodes): `AwaitingSignatureBanner()`, `AwaitingSignatureBanner.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 79`** (2 nodes): `PostFinalSendModal.jsx`, `PostFinalSendModal()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 80`** (2 nodes): `SignChannelModal.jsx`, `SignChannelModal()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 81`** (2 nodes): `FilterBar()`, `FilterBar.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 82`** (2 nodes): `ReservationsTable.jsx`, `ReservationsTable()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 83`** (2 nodes): `SourceChannelBadge.jsx`, `SourceChannelBadge()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 84`** (2 nodes): `StatusBadge.jsx`, `StatusBadge()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 85`** (2 nodes): `AiDamagePanel()`, `AiDamagePanel.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 86`** (2 nodes): `Step1Return.jsx`, `Step1Return()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 87`** (2 nodes): `Step2Photos.jsx`, `Step2Photos()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 88`** (2 nodes): `FleetConfigTab()`, `FleetConfigTab.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 89`** (2 nodes): `GeneralConfigTab()`, `GeneralConfigTab.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 90`** (2 nodes): `IntegrationsTab()`, `IntegrationsTab.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 91`** (2 nodes): `PrivacyTab.jsx`, `PrivacyTab()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 92`** (2 nodes): `RentalOptionsSection.jsx`, `RentalOptionsSection()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 93`** (2 nodes): `SignatureSection.jsx`, `SignatureSection()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 94`** (2 nodes): `TelematicsTab.jsx`, `TelematicsTab()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 95`** (2 nodes): `applyReservationFilters()`, `reservationFilters.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 96`** (2 nodes): `vehicleMapper.js`, `vehicleRowToApi()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 97`** (2 nodes): `requirePremium()`, `premium.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 98`** (2 nodes): `maskEmail()`, `contracts.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 99`** (2 nodes): `cleanupPendingDemands()`, `cleanupPendingDemands.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 100`** (2 nodes): `purgeSignedPdfs()`, `purgeSignedPdfs.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 101`** (2 nodes): `getScannerService()`, `scanner.factory.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 102`** (2 nodes): `compressImage()`, `imageUtils.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 103`** (2 nodes): `buildRentalPrefill()`, `leadToRental.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 104`** (1 nodes): `main.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 105`** (1 nodes): `vite.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 106`** (1 nodes): `supabase.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 107`** (1 nodes): `OtherPages.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 108`** (1 nodes): `index.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 109`** (1 nodes): `supabaseAdmin.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 110`** (1 nodes): `triage.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 111`** (1 nodes): `admin.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 112`** (1 nodes): `agency.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 113`** (1 nodes): `ai.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 114`** (1 nodes): `email.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 115`** (1 nodes): `health.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 116`** (1 nodes): `ocr.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 117`** (1 nodes): `reservations.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 118`** (1 nodes): `team.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 119`** (1 nodes): `whatsapp.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 120`** (1 nodes): `contractSigning.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 121`** (1 nodes): `purgeSignedPdfs.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 122`** (1 nodes): `identity.schema.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 123`** (1 nodes): `queryClient.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 124`** (1 nodes): `scanner.interface.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 125`** (1 nodes): `alerts.test.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 126`** (1 nodes): `inboundPipeline.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 127`** (1 nodes): `leadToRental.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 128`** (1 nodes): `setup.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 129`** (1 nodes): `triage.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 130`** (1 nodes): `vehicleMapper.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getGeneralConfig()` connect `Community 4` to `Community 1`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `getFleetConfigForMake()` connect `Community 5` to `Community 1`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Why does `getSession()` connect `Community 10` to `Community 0`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
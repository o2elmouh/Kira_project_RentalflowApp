# Graph Report - .  (2026-04-27)

## Corpus Check
- 117 files · ~1,452,694 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 480 nodes · 640 edges · 95 communities detected
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 50 edges (avg confidence: 0.8)
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

## God Nodes (most connected - your core abstractions)
1. `read()` - 37 edges
2. `getAgencyId()` - 20 edges
3. `write()` - 20 edges
4. `sbSelect()` - 17 edges
5. `sbUpsert()` - 14 edges
6. `uid()` - 11 edges
7. `handleInboundWhatsApp()` - 9 edges
8. `displayPlate()` - 8 edges
9. `generateContract()` - 8 edges
10. `_buildContractDoc()` - 8 edges

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
Nodes (67): addRepair(), clientFromDb(), clientToDb(), contractFromDb(), contractToDb(), deleteClient(), deleteRepair(), deleteVehicle() (+59 more)

### Community 1 - "Community 1"
Cohesion: 0.09
Nodes (50): computeAgencyPayout(), computePL(), generateRentalInvoice(), getAccountByCode(), holdDeposit(), postTransaction(), releaseDeposit(), deleteClient() (+42 more)

### Community 2 - "Community 2"
Cohesion: 0.12
Nodes (19): pollAgency(), analyzeQuoteReply(), appendConversation(), classifyTextMessage(), decrypt(), extractWithClaude(), findMatchingDemand(), getClientStatus() (+11 more)

### Community 3 - "Community 3"
Cohesion: 0.23
Nodes (19): amountInWords(), belowHundred(), belowThousand(), _buildContractDoc(), _buildInvoiceDoc(), displayPlate(), drawCarDiagram(), drawFuelGauge() (+11 more)

### Community 4 - "Community 4"
Cohesion: 0.13
Nodes (9): computeDeadlinesFromConfig(), displayPlate(), parsePlate(), DeadlinesTab(), autoFillMaintenance(), PlateInput(), getFleetConfig(), getFleetConfigForMake() (+1 more)

### Community 5 - "Community 5"
Cohesion: 0.18
Nodes (9): generateRestitutionPDF(), Restitution(), computeExtraFees(), daysBetween(), fmtDate(), nowTime(), today(), Step3Damages() (+1 more)

### Community 6 - "Community 6"
Cohesion: 0.17
Nodes (5): fmt(), AgedReceivablesView(), PnLView(), TabDeposits(), TabJournal()

### Community 7 - "Community 7"
Cohesion: 0.29
Nodes (6): getAuthHeaders(), getSession(), getWAVersion(), normaliseJid(), sendWhatsAppMessage(), startSession()

### Community 8 - "Community 8"
Cohesion: 0.31
Nodes (5): CONF_COLOR(), ConfBadge(), formatSenderId(), LeadCard(), LeadModal()

### Community 9 - "Community 9"
Cohesion: 0.25
Nodes (0): 

### Community 10 - "Community 10"
Cohesion: 0.46
Nodes (6): createSigningToken(), getContractForToken(), loadTokens(), saveClientSignature(), saveTokens(), getContracts()

### Community 11 - "Community 11"
Cohesion: 0.39
Nodes (5): Contracts(), daysBetween(), fmtDate(), statusBadgeClass(), statusLabel()

### Community 12 - "Community 12"
Cohesion: 0.62
Nodes (6): capitalise(), normaliseDate(), parseCIN(), parseLicence(), parseMRZ(), runOCR()

### Community 13 - "Community 13"
Cohesion: 0.29
Nodes (0): 

### Community 14 - "Community 14"
Cohesion: 0.33
Nodes (2): autoFillMaintenance(), getDefaultConfigForMake()

### Community 15 - "Community 15"
Cohesion: 0.33
Nodes (2): TeamTab(), useIsAdmin()

### Community 16 - "Community 16"
Cohesion: 0.33
Nodes (0): 

### Community 17 - "Community 17"
Cohesion: 0.33
Nodes (0): 

### Community 18 - "Community 18"
Cohesion: 0.4
Nodes (4): ScanStep(), mapToClientFields(), resolveNationality(), useScannerFlow()

### Community 19 - "Community 19"
Cohesion: 0.33
Nodes (0): 

### Community 20 - "Community 20"
Cohesion: 0.4
Nodes (2): requireAuth(), getUser()

### Community 21 - "Community 21"
Cohesion: 0.4
Nodes (2): AgenceTab(), Field()

### Community 22 - "Community 22"
Cohesion: 0.5
Nodes (2): fmtDate(), SignContract()

### Community 23 - "Community 23"
Cohesion: 0.5
Nodes (2): toMaskedCarDTO(), toRevealedCarDTO()

### Community 24 - "Community 24"
Cohesion: 0.5
Nodes (2): traccarAuth(), traccarFetch()

### Community 25 - "Community 25"
Cohesion: 0.6
Nodes (2): ClaudeScannerService, getAuthToken()

### Community 26 - "Community 26"
Cohesion: 0.83
Nodes (3): AlertCard(), formatSenderId(), timeAgo()

### Community 27 - "Community 27"
Cohesion: 0.5
Nodes (0): 

### Community 28 - "Community 28"
Cohesion: 0.5
Nodes (0): 

### Community 29 - "Community 29"
Cohesion: 0.67
Nodes (2): getCarPos(), WelcomeScreen()

### Community 30 - "Community 30"
Cohesion: 0.5
Nodes (0): 

### Community 31 - "Community 31"
Cohesion: 0.67
Nodes (0): 

### Community 32 - "Community 32"
Cohesion: 1.0
Nodes (2): main(), seedForAgency()

### Community 33 - "Community 33"
Cohesion: 0.67
Nodes (1): MockScannerService

### Community 34 - "Community 34"
Cohesion: 0.67
Nodes (0): 

### Community 35 - "Community 35"
Cohesion: 0.67
Nodes (0): 

### Community 36 - "Community 36"
Cohesion: 0.67
Nodes (0): 

### Community 37 - "Community 37"
Cohesion: 1.0
Nodes (0): 

### Community 38 - "Community 38"
Cohesion: 1.0
Nodes (0): 

### Community 39 - "Community 39"
Cohesion: 1.0
Nodes (0): 

### Community 40 - "Community 40"
Cohesion: 1.0
Nodes (0): 

### Community 41 - "Community 41"
Cohesion: 1.0
Nodes (0): 

### Community 42 - "Community 42"
Cohesion: 1.0
Nodes (0): 

### Community 43 - "Community 43"
Cohesion: 1.0
Nodes (0): 

### Community 44 - "Community 44"
Cohesion: 1.0
Nodes (0): 

### Community 45 - "Community 45"
Cohesion: 1.0
Nodes (0): 

### Community 46 - "Community 46"
Cohesion: 1.0
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

## Knowledge Gaps
- **Thin community `Community 37`** (2 nodes): `App()`, `App.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (2 nodes): `LanguageSelector.jsx`, `LanguageSelector()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (2 nodes): `Sidebar.jsx`, `Sidebar()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (2 nodes): `Invoices()`, `Invoices.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (2 nodes): `NewRental()`, `NewRental.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (2 nodes): `RestitutionPicker.jsx`, `RestitutionPicker()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (2 nodes): `Settings.jsx`, `Settings()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (2 nodes): `BarChart()`, `BarChart.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (2 nodes): `KpiCard()`, `KpiCard.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (2 nodes): `Modal()`, `Modal.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (2 nodes): `TabDashboard.jsx`, `TabDashboard()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (2 nodes): `TabPlanComptable.jsx`, `TabPlanComptable()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (2 nodes): `UtilizationView.jsx`, `UtilizationView()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (2 nodes): `AmortissementTab()`, `AmortissementTab.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (2 nodes): `DeadlineBadge()`, `DeadlineBadge.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (2 nodes): `InlineRepairsSection()`, `InlineRepairsSection.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (2 nodes): `ReferencePhotosSection.jsx`, `ReferencePhotosSection()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (2 nodes): `RentalsTab.jsx`, `RentalsTab()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (2 nodes): `RepairsTab.jsx`, `RepairsTab()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (2 nodes): `VehicleEditForm.jsx`, `VehicleEditForm()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (2 nodes): `CarDiagram()`, `CarDiagram.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (2 nodes): `ClientAlerts()`, `ClientAlerts.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 59`** (2 nodes): `ContractStep()`, `ContractStep.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 60`** (2 nodes): `PhotoStep.jsx`, `PhotoStep()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 61`** (2 nodes): `RentalStep.jsx`, `RentalStep()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 62`** (2 nodes): `StepBar.jsx`, `StepBar()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 63`** (2 nodes): `StepButtons.jsx`, `StepButtons()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 64`** (2 nodes): `AiDamagePanel()`, `AiDamagePanel.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 65`** (2 nodes): `Step1Return.jsx`, `Step1Return()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 66`** (2 nodes): `Step2Photos.jsx`, `Step2Photos()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 67`** (2 nodes): `FleetConfigTab()`, `FleetConfigTab.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 68`** (2 nodes): `GeneralConfigTab()`, `GeneralConfigTab.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 69`** (2 nodes): `IntegrationsTab()`, `IntegrationsTab.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 70`** (2 nodes): `RentalOptionsSection.jsx`, `RentalOptionsSection()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 71`** (2 nodes): `SignatureSection.jsx`, `SignatureSection()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 72`** (2 nodes): `TelematicsTab.jsx`, `TelematicsTab()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 73`** (2 nodes): `requirePremium()`, `premium.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 74`** (2 nodes): `getScannerService()`, `scanner.factory.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 75`** (2 nodes): `compressImage()`, `imageUtils.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 76`** (1 nodes): `main.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 77`** (1 nodes): `vite.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 78`** (1 nodes): `i18n.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 79`** (1 nodes): `supabase.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 80`** (1 nodes): `OtherPages.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 81`** (1 nodes): `index.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 82`** (1 nodes): `supabaseAdmin.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 83`** (1 nodes): `agency.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 84`** (1 nodes): `ai.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 85`** (1 nodes): `contracts.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 86`** (1 nodes): `email.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 87`** (1 nodes): `health.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 88`** (1 nodes): `ocr.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 89`** (1 nodes): `team.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 90`** (1 nodes): `identity.schema.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 91`** (1 nodes): `scanner.interface.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 92`** (1 nodes): `alerts.test.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 93`** (1 nodes): `setup.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 94`** (1 nodes): `triage.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getGeneralConfig()` connect `Community 3` to `Community 1`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `getFleetConfigForMake()` connect `Community 4` to `Community 1`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Why does `read()` connect `Community 1` to `Community 10`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._
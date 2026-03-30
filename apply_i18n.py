filepath = r"C:\Users\otman\Downloads\Rental flow app SAAS\pages\OtherPages.jsx"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

replacements = []

# ── 1. Invoices: add useTranslation hook ─────────────────────────────────────
replacements.append((
    "export function Invoices() {\n  const [invoices, setInvoices] = useState(() => getInvoices())",
    "export function Invoices() {\n  const { t } = useTranslation('invoices')\n  const [invoices, setInvoices] = useState(() => getInvoices())"
))

# Invoices: title + count
replacements.append((
    "<h2>Factures</h2><p>{invoices.length} factures \u00b7 {(total || 0).toLocaleString('fr-MA')} MAD total</p>",
    "<h2>{t('title')}</h2><p>{t('count', { count: invoices.length, total: (total || 0).toLocaleString('fr-MA') })}</p>"
))

# Invoices: empty state
replacements.append((
    ">Aucune facture pour l'instant.</p>",
    ">{t('empty')}</p>"
))

# Invoices: ref label
replacements.append((
    "\u00b7 R\u00e9f: {inv.contractNumber}",
    "\u00b7 {t('ref')} {inv.contractNumber}"
))

# Invoices: status badges
replacements.append((
    "{inv.status === 'paid' ? 'Pay\u00e9e' : inv.status === 'pending' ? 'En attente' : inv.status || 'En attente'}",
    "{inv.status === 'paid' ? t('status.paid') : inv.status === 'pending' ? t('status.pending') : inv.status || t('status.pending')}"
))

# ── 2. Settings: replace SETTINGS_TABS const + Settings function header ───────
replacements.append((
    "const SETTINGS_TABS = [\n  { id: 'agence', label: 'Agence' },\n  { id: 'parc', label: 'Configuration parc' },\n  { id: 'general', label: 'Configuration g\u00e9n\u00e9rale' },\n  { id: 'equipe', label: '\u00c9quipe' },\n]\n\nexport function Settings() {\n  const [activeTab, setActiveTab] = useState('agence')\n\n  return (\n    <div>\n      <div className=\"page-header\"><div><h2>Param\u00e8tres</h2><p>Configuration de l'agence</p></div></div>",
    "export function Settings() {\n  const { t } = useTranslation('settings')\n  const [activeTab, setActiveTab] = useState('agence')\n\n  const SETTINGS_TABS = [\n    { id: 'agence', label: t('tabs.agency') },\n    { id: 'parc', label: t('tabs.fleetConfig') },\n    { id: 'general', label: t('tabs.general') },\n    { id: 'equipe', label: '\u00c9quipe' },\n  ]\n\n  return (\n    <div>\n      <div className=\"page-header\"><div><h2>{t('title')}</h2><p>{t('subtitle')}</p></div></div>"
))

# ── 3. AgenceTab: add hook ────────────────────────────────────────────────────
replacements.append((
    "function AgenceTab() {\n  const [agency, setAgency] = useState(getAgency)",
    "function AgenceTab() {\n  const { t } = useTranslation('settings')\n  const [agency, setAgency] = useState(getAgency)"
))

# AgenceTab: "Informations générales" + saved badge
replacements.append((
    "          <h3>Informations g\u00e9n\u00e9rales</h3>\n          {saved && <span className=\"badge badge-green\">Enregistr\u00e9</span>}",
    "          <h3>{t('agency.generalInfo')}</h3>\n          {saved && <span className=\"badge badge-green\">{t('agency.saved')}</span>}"
))

# AgenceTab: field calls - name
replacements.append((
    "            {field('Nom de l\\'agence', 'name', 'Ex: Location Auto Maroc')}",
    "            {field(t('agency.name'), 'name', t('agency.namePlaceholder'))}"
))
# AgenceTab: city
replacements.append((
    "            {field('Ville', 'city', 'Ex: Casablanca')}",
    "            {field(t('agency.city'), 'city', t('agency.cityPlaceholder'))}"
))
# AgenceTab: address
replacements.append((
    "            {field('Adresse', 'address', 'Ex: 12 Rue des Fleurs, Casablanca')}",
    "            {field(t('agency.address'), 'address', t('agency.addressPlaceholder'))}"
))
# AgenceTab: phone
replacements.append((
    "            {field('T\u00e9l\u00e9phone', 'phone', 'Ex: +212 6XX XXX XXX')}",
    "            {field(t('agency.phone'), 'phone', t('agency.phonePlaceholder'))}"
))
# AgenceTab: email
replacements.append((
    "            {field('Email de l\\'agence', 'email', 'Ex: contact@agence.ma')}",
    "            {field(t('agency.email'), 'email', t('agency.emailPlaceholder'))}"
))
# AgenceTab: legal section header
replacements.append((
    "          <h3>Identifiants fiscaux &amp; l\u00e9gaux</h3>",
    "          <h3>{t('agency.legalSection')}</h3>"
))
# AgenceTab: ICE
replacements.append((
    "            {field('ICE', 'ice', 'Identifiant Commun de l\\'Entreprise')}",
    "            {field(t('agency.ice'), 'ice', t('agency.icePlaceholder'))}"
))
# AgenceTab: RC
replacements.append((
    "            {field('RC', 'rc', 'Registre de Commerce')}",
    "            {field(t('agency.rc'), 'rc', t('agency.rcPlaceholder'))}"
))
# AgenceTab: IF
replacements.append((
    "            {field('IF \u2014 Identifiant Fiscal', 'if_number', 'Ex: 12345678')}",
    "            {field(t('agency.if'), 'if_number', t('agency.ifPlaceholder'))}"
))
# AgenceTab: Patente
replacements.append((
    "            {field('Patente', 'patente', 'Num\u00e9ro de patente')}",
    "            {field(t('agency.patente'), 'patente', t('agency.patentePlaceholder'))}"
))
# AgenceTab: insurance
replacements.append((
    "            {field('N\u00b0 Police d\\'assurance', 'insurance_policy', 'Ex: ASS-2024-00123')}",
    "            {field(t('agency.insurance'), 'insurance_policy', t('agency.insurancePlaceholder'))}"
))
# AgenceTab: save button
replacements.append((
    "          <button className=\"btn btn-primary mt-2\" onClick={save}>Enregistrer les param\u00e8tres</button>",
    "          <button className=\"btn btn-primary mt-2\" onClick={save}>{t('agency.saveBtn')}</button>"
))

# ── 4. RentalOptionsSection: add hook ────────────────────────────────────────
replacements.append((
    "function RentalOptionsSection() {\n  const loadOptions = () => {",
    "function RentalOptionsSection() {\n  const { t } = useTranslation('settings')\n  const loadOptions = () => {"
))
# title
replacements.append((
    "        <h3>Options de location</h3>\n        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>\n          {saved && <span className=\"badge badge-green\">Enregistr\u00e9</span>}\n          {!editMode && (\n            <button className=\"btn btn-ghost btn-sm\" onClick={() => setEditMode(true)}>Modifier</button>",
    "        <h3>{t('general.options.title')}</h3>\n        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>\n          {saved && <span className=\"badge badge-green\">{t('general.options.saved')}</span>}\n          {!editMode && (\n            <button className=\"btn btn-ghost btn-sm\" onClick={() => setEditMode(true)}>{t('general.options.editBtn')}</button>"
))
# placeholder
replacements.append((
    "                placeholder=\"Nom de l'option\"",
    "                placeholder={t('general.options.namePlaceholder')}"
))
# per_day / fixed
replacements.append((
    "                <option value=\"per_day\">Par jour</option>\n                <option value=\"fixed\">Fixe</option>",
    "                <option value=\"per_day\">{t('general.options.perDay')}</option>\n                <option value=\"fixed\">{t('general.options.fixed')}</option>"
))
# add/save/cancel buttons
replacements.append((
    "            <button className=\"btn btn-secondary\" style={{ fontSize: 13 }} onClick={addOption}>\n              + Ajouter une option\n            </button>\n            <button className=\"btn btn-primary\" style={{ fontSize: 13 }} onClick={save}>\n              Enregistrer\n            </button>\n            <button className=\"btn btn-ghost\" style={{ fontSize: 13 }} onClick={() => { setOptions(loadOptions()); setEditMode(false) }}>\n              Annuler\n            </button>",
    "            <button className=\"btn btn-secondary\" style={{ fontSize: 13 }} onClick={addOption}>\n              {t('general.options.addBtn')}\n            </button>\n            <button className=\"btn btn-primary\" style={{ fontSize: 13 }} onClick={save}>\n              {t('general.options.saveBtn')}\n            </button>\n            <button className=\"btn btn-ghost\" style={{ fontSize: 13 }} onClick={() => { setOptions(loadOptions()); setEditMode(false) }}>\n              {t('general.options.cancelBtn')}\n            </button>"
))

# ── 5. GeneralConfigTab: add hook + sections ─────────────────────────────────
replacements.append((
    "function GeneralConfigTab() {\n  const [activeSection, setActiveSection] = useState('options')\n\n  const sections = [\n    { id: 'options',    label: 'Options de location' },\n    { id: 'signature',  label: 'Signature par d\u00e9faut' },\n    { id: 'params',     label: 'Param\u00e8tres' },\n  ]",
    "function GeneralConfigTab() {\n  const { t } = useTranslation('settings')\n  const [activeSection, setActiveSection] = useState('options')\n\n  const sections = [\n    { id: 'options',    label: t('general.tabs.options') },\n    { id: 'signature',  label: t('general.tabs.signature') },\n    { id: 'params',     label: t('general.tabs.params') },\n  ]"
))
# params sub-card
replacements.append((
    "          <div className=\"card-header\"><h3>Param\u00e8tres g\u00e9n\u00e9raux</h3></div>\n          <div className=\"card-body\">\n            <p style={{ fontSize: 13, color: 'var(--text3)' }}>\n              D'autres param\u00e8tres g\u00e9n\u00e9raux seront ajout\u00e9s ici prochainement.\n            </p>\n            <div style={{ fontSize: 13, color: 'var(--text2)', background: 'var(--bg2)', borderRadius: 8, padding: '10px 14px', display: 'flex', gap: 8 }}>\n              <span>\u2139\ufe0f</span>\n              <span>La limite kilom\u00e9trique est d\u00e9sormais configurable par v\u00e9hicule dans la fiche de chaque voiture (onglet Flotte).</span>",
    "          <div className=\"card-header\"><h3>{t('general.params.title')}</h3></div>\n          <div className=\"card-body\">\n            <p style={{ fontSize: 13, color: 'var(--text3)' }}>\n              {t('general.params.comingSoon')}\n            </p>\n            <div style={{ fontSize: 13, color: 'var(--text2)', background: 'var(--bg2)', borderRadius: 8, padding: '10px 14px', display: 'flex', gap: 8 }}>\n              <span>\u2139\ufe0f</span>\n              <span>{t('general.params.kmNote')}</span>"
))

# ── 6. FleetConfigTab: move FLEET_CONFIG_COLS inside and add hook ─────────────
replacements.append((
    "const FLEET_CONFIG_COLS = [\n  { key: 'make',             label: 'Marque',                     type: 'text' },\n  { key: 'warrantyGeneral',  label: 'Garantie g\u00e9n\u00e9rale',          type: 'text' },\n  { key: 'warrantyYears',    label: 'Dur\u00e9e (ans)',                type: 'number' },\n  { key: 'warrantyBattery',  label: 'Garantie batterie',          type: 'text' },\n  { key: 'controlTechYears', label: 'Contr\u00f4le technique (ans)',   type: 'number' },\n  { key: 'vidangeKm',        label: 'Vidange (km)',               type: 'number' },\n  { key: 'courroieKm',       label: 'Courroie distribution (km)', type: 'number' },\n  { key: 'extension',        label: 'Extension possible',         type: 'text' },\n]\n\nfunction FleetConfigTab() {\n  const [config, setConfig] = useState(() => getFleetConfig())",
    "function FleetConfigTab() {\n  const { t } = useTranslation('settings')\n  const FLEET_CONFIG_COLS = [\n    { key: 'make',             label: t('fleetConfig.headers.brand'),           type: 'text' },\n    { key: 'warrantyGeneral',  label: t('fleetConfig.headers.generalWarranty'), type: 'text' },\n    { key: 'warrantyYears',    label: t('fleetConfig.headers.durationYears'),   type: 'number' },\n    { key: 'warrantyBattery',  label: t('fleetConfig.headers.batteryWarranty'), type: 'text' },\n    { key: 'controlTechYears', label: t('fleetConfig.headers.controleTech'),    type: 'number' },\n    { key: 'vidangeKm',        label: t('fleetConfig.headers.oilChange'),       type: 'number' },\n    { key: 'courroieKm',       label: t('fleetConfig.headers.timingBelt'),      type: 'number' },\n    { key: 'extension',        label: t('fleetConfig.headers.extensible'),      type: 'text' },\n  ]\n  const [config, setConfig] = useState(() => getFleetConfig())"
))
# FleetConfigTab: card header title
replacements.append((
    "        <h3>Configuration parc</h3>",
    "        <h3>{t('fleetConfig.title')}</h3>"
))
# FleetConfigTab: reset button
replacements.append((
    "          R\u00e9initialiser les valeurs par d\u00e9faut\n        </button>",
    "          {t('fleetConfig.resetBtn')}\n        </button>"
))
# FleetConfigTab: row action buttons - Sauvegarder / Annuler
replacements.append((
    "                        <button className=\"btn btn-primary\" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => saveRow(i)}>Sauvegarder</button>\n                        <button className=\"btn btn-secondary\" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setEditRow(null)}>Annuler</button>",
    "                        <button className=\"btn btn-primary\" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => saveRow(i)}>{t('agency.saveBtn')}</button>\n                        <button className=\"btn btn-secondary\" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setEditRow(null)}>{t('general.options.cancelBtn')}</button>"
))
# FleetConfigTab: Modifier button
replacements.append((
    "                          <Edit2 size={13} /> Modifier\n                        </button>",
    "                          <Edit2 size={13} /> {t('general.options.editBtn')}\n                        </button>"
))
# FleetConfigTab: Enregistré saved badge
replacements.append((
    "                        {savedRow === i && <span className=\"badge badge-green\" style={{ fontSize: 11 }}>Enregistr\u00e9</span>}",
    "                        {savedRow === i && <span className=\"badge badge-green\" style={{ fontSize: 11 }}>{t('agency.saved')}</span>}"
))

# Apply all replacements
missed = []
for old, new in replacements:
    if old in content:
        content = content.replace(old, new, 1)
    else:
        missed.append(repr(old[:60]))

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

if missed:
    print("MISSED replacements:")
    for m in missed:
        print(" ", m)
else:
    print("All replacements applied successfully.")

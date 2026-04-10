import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { getGeneralConfig } from '../lib/db'

const ACCENT = [199, 75, 31]
const DARK   = [28, 26, 22]
const GRAY   = [120, 116, 108]
const LIGHT  = [245, 243, 238]

// ── Helpers ──────────────────────────────────────────────

/**
 * Convert a plate stored as "serial|letter|region" to "region letter serial" for display.
 * Example: "12345|و|21" → "21 و 12345"
 */
function displayPlate(plate) {
  if (!plate) return '—'
  if (!plate.includes('|')) return plate  // legacy or plain text — return as-is
  const parts = plate.split('|')
  if (parts.length === 3) {
    const [serial, letter, region] = parts
    return `${region} ${letter} ${serial}`
  }
  return plate
}

const ONES = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
              'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
              'dix-sept', 'dix-huit', 'dix-neuf']
const TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante',
              'soixante', 'quatre-vingt', 'quatre-vingt']

function belowHundred(n) {
  if (n < 20) return ONES[n]
  const t = Math.floor(n / 10)
  const o = n % 10
  if (t === 7) {
    // 70–79: soixante-dix, soixante et onze, soixante-douze …
    if (o === 1) return 'soixante et onze'
    return 'soixante-' + ONES[10 + o]
  }
  if (t === 9) {
    // 90–99: quatre-vingt-dix …
    return 'quatre-vingt-' + (o === 0 ? 'dix' : ONES[10 + o])
  }
  if (o === 0) return TENS[t] + (t === 8 ? 's' : '')
  if (o === 1 && t !== 8) return TENS[t] + ' et un'
  return TENS[t] + '-' + ONES[o]
}

function belowThousand(n) {
  if (n === 0) return ''
  if (n < 100) return belowHundred(n)
  const h = Math.floor(n / 100)
  const r = n % 100
  const hStr = h === 1 ? 'cent' : ONES[h] + ' cent'
  if (r === 0) return h === 1 ? 'cent' : ONES[h] + ' cents'
  return hStr + ' ' + belowHundred(r)
}

/**
 * Convert a number to French words.
 * Handles 0–999 999. Includes centimes if decimal part present.
 * Example: 3600 → "Trois mille six cents dirhams"
 */
export function amountInWords(n) {
  if (isNaN(n) || n == null) return '—'
  const total = Math.round(n * 100)
  const dirhams = Math.floor(total / 100)
  const centimes = total % 100

  let words = ''
  if (dirhams === 0) {
    words = 'zéro'
  } else {
    const millions = Math.floor(dirhams / 1000000)
    const thousands = Math.floor((dirhams % 1000000) / 1000)
    const remainder = dirhams % 1000

    const parts = []
    if (millions > 0) {
      parts.push(millions === 1 ? 'un million' : belowThousand(millions) + ' millions')
    }
    if (thousands > 0) {
      parts.push(thousands === 1 ? 'mille' : belowThousand(thousands) + ' mille')
    }
    if (remainder > 0) {
      parts.push(belowThousand(remainder))
    }
    words = parts.join(' ')
  }

  // Capitalise first letter
  words = words.charAt(0).toUpperCase() + words.slice(1)

  let result = words + ' dirham' + (dirhams > 1 ? 's' : '')
  if (centimes > 0) {
    result += ' et ' + belowThousand(centimes) + ' centime' + (centimes > 1 ? 's' : '')
  }
  result += ' TTC'
  return result
}

// ── Layout helpers ────────────────────────────────────────

function header(doc, agency, title, docNumber) {
  doc.setFillColor(...DARK)
  doc.rect(0, 0, 210, 24, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(255, 255, 255)
  doc.text(agency.name || 'Car Rental Agency', 14, 10)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(200, 195, 185)
  doc.text(
    `${agency.address || ''}  |  ${agency.phone || ''}  |  ${agency.email ? agency.email + '  |  ' : ''}ICE: ${agency.ice || ''}`,
    14, 16
  )

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(docNumber, 210 - 14, 10, { align: 'right' })

  doc.setFillColor(...ACCENT)
  doc.rect(0, 24, 210, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  doc.text(title, 105, 29.5, { align: 'center' })

  return 40
}

function sectionTitle(doc, text, y) {
  doc.setFillColor(...LIGHT)
  doc.rect(14, y, 182, 7, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...DARK)
  doc.text(text, 16, y + 5)
  return y + 10
}

function fieldRow(doc, label, value, x, y, colW = 85) {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...GRAY)
  doc.text(label, x, y)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...DARK)
  doc.text(String(value || '—'), x + colW, y)
  return y + 6
}

// ── Fuel gauge drawing helper ─────────────────────────────

const FUEL_LEVELS = ['Vide', '1/4', '1/2', '3/4', 'Plein']

function drawFuelGauge(doc, x, y, fuelLevel) {
  const segW = 22
  const segH = 8
  const gap  = 1
  const totalW = FUEL_LEVELS.length * segW + (FUEL_LEVELS.length - 1) * gap

  // Label above
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...DARK)
  doc.text('Niveau carburant :', x, y - 2)

  const filledIdx = FUEL_LEVELS.indexOf(fuelLevel)

  FUEL_LEVELS.forEach((label, i) => {
    const sx = x + i * (segW + gap)
    const isFilled = i <= filledIdx && filledIdx >= 0
    if (isFilled) {
      doc.setFillColor(...ACCENT)
      doc.rect(sx, y, segW, segH, 'F')
    } else {
      doc.setFillColor(230, 228, 222)
      doc.rect(sx, y, segW, segH, 'F')
    }
    doc.setDrawColor(...GRAY)
    doc.setLineWidth(0.3)
    doc.rect(sx, y, segW, segH)
    doc.setFont('helvetica', isFilled ? 'bold' : 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(isFilled ? 255 : 80, isFilled ? 255 : 78, isFilled ? 255 : 72)
    doc.text(label, sx + segW / 2, y + 5.2, { align: 'center' })
  })

  return y + segH + 4
}

// ── Car diagram (top-down view) ───────────────────────────

function drawCarDiagram(doc, cx, cy) {
  // cx, cy = centre of car diagram
  const bw = 30  // body width
  const bl = 60  // body length
  const bx = cx - bw / 2
  const by = cy - bl / 2

  // Body outline
  doc.setDrawColor(...DARK)
  doc.setLineWidth(0.6)
  doc.setFillColor(240, 238, 234)
  doc.roundedRect(bx, by, bw, bl, 5, 5, 'FD')

  // Windshield front
  doc.setFillColor(210, 230, 255)
  doc.roundedRect(bx + 3, by + 8, bw - 6, 10, 2, 2, 'FD')

  // Windshield rear
  doc.roundedRect(bx + 3, by + bl - 18, bw - 6, 10, 2, 2, 'FD')

  // Wheels (4 corners)
  const ww = 5; const wh = 10
  doc.setFillColor(60, 58, 52)
  // front-left
  doc.rect(bx - ww, by + 8, ww, wh, 'F')
  // front-right
  doc.rect(bx + bw, by + 8, ww, wh, 'F')
  // rear-left
  doc.rect(bx - ww, by + bl - 18, ww, wh, 'F')
  // rear-right
  doc.rect(bx + bw, by + bl - 18, ww, wh, 'F')

  // Zone labels
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...DARK)

  // A — AVANT (top)
  doc.text('A', cx, by - 4, { align: 'center' })
  // B — ARRIÈRE (bottom)
  doc.text('B', cx, by + bl + 7, { align: 'center' })
  // C — CÔTÉ G (left)
  doc.text('C', bx - ww - 8, cy, { align: 'center' })
  // D — CÔTÉ D (right)
  doc.text('D', bx + bw + ww + 8, cy, { align: 'center' })
  // E — TOIT (centre of car body)
  doc.text('E', cx, cy, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.setTextColor(...GRAY)
  doc.text('AVANT', cx, by - 9, { align: 'center' })
  doc.text('ARRIÈRE', cx, by + bl + 12, { align: 'center' })
  doc.text('CÔTÉ G', bx - ww - 8, cy + 5, { align: 'center' })
  doc.text('CÔTÉ D', bx + bw + ww + 8, cy + 5, { align: 'center' })
  doc.text('TOIT', cx, cy + 5, { align: 'center' })
}

// ── Contract ──────────────────────────────────────────────

export async function generateContract(contract, client, vehicle, agency) {
  const { defaultSignature } = (await getGeneralConfig()) || {}
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  let y = header(doc, agency, 'CONTRAT DE LOCATION DE VÉHICULE', contract.contractNumber)

  // Article 1 — Parties
  y = sectionTitle(doc, 'ARTICLE 1 — PARTIES', y)
  y = fieldRow(doc, 'Loueur:', agency.name, 14, y)
  y = fieldRow(doc, 'Adresse:', agency.address, 14, y)
  y = fieldRow(doc, 'RC / ICE:', `${agency.rc || ''}  /  ${agency.ice || ''}`, 14, y)
  y += 2
  y = fieldRow(doc, 'Locataire:', `${client.firstName} ${client.lastName}`, 14, y)
  y = fieldRow(doc, 'CIN / Passeport:', client.cinNumber, 14, y)
  y = fieldRow(doc, 'Expiry CIN:', client.cinExpiry || '—', 14, y)
  y = fieldRow(doc, 'Permis de conduire:', client.drivingLicenseNumber, 14, y)
  y = fieldRow(doc, 'Expiry Permis:', client.licenseExpiry || '—', 14, y)
  y = fieldRow(doc, 'Tél:', client.phone, 14, y)
  y = fieldRow(doc, 'Email:', client.email, 14, y)
  y += 3

  // Article 2 — Véhicule
  y = sectionTitle(doc, 'ARTICLE 2 — VÉHICULE', y)
  y = fieldRow(doc, 'Véhicule:', `${vehicle.make} ${vehicle.model} (${vehicle.year})`, 14, y)
  y = fieldRow(doc, 'Immatriculation:', displayPlate(vehicle.plate), 14, y)
  y = fieldRow(doc, 'Couleur:', vehicle.color, 14, y)
  y = fieldRow(doc, 'Carburant:', vehicle.fuelType, 14, y)
  y = fieldRow(doc, 'Kilométrage départ:', `${contract.mileageOut || vehicle.mileage || '—'} km`, 14, y)
  y += 3

  // Article 3 — Conditions de location
  y = sectionTitle(doc, 'ARTICLE 3 — CONDITIONS DE LOCATION', y)
  y = fieldRow(doc, 'Date de départ:', contract.startDate, 14, y)
  y = fieldRow(doc, 'Heure de départ:', contract.startTime || '—', 14, y)
  y = fieldRow(doc, 'Date de retour:', contract.endDate, 14, y)
  y = fieldRow(doc, 'Heure de retour:', contract.endTime || '—', 14, y)
  y = fieldRow(doc, 'Durée:', `${contract.days} jour(s)`, 14, y)
  y = fieldRow(doc, 'Niveau carburant départ:', contract.fuelLevel || '—', 14, y)
  y = fieldRow(doc, 'Lieu de départ:', contract.pickupLocation || agency.city, 14, y)
  y = fieldRow(doc, 'Lieu de retour:', contract.returnLocation || agency.city, 14, y)
  y += 3

  // Article 4 — Tarif et caution
  y = sectionTitle(doc, 'ARTICLE 4 — TARIF ET CAUTION', y)
  y = fieldRow(doc, 'Tarif journalier:', `${vehicle.dailyRate} MAD / jour`, 14, y)
  y = fieldRow(doc, 'Montant total (HT):', `${contract.totalHT} MAD`, 14, y)
  y = fieldRow(doc, 'TVA (20%):', `${contract.tva} MAD`, 14, y)
  y = fieldRow(doc, 'Total TTC:', `${contract.totalTTC} MAD`, 14, y)
  y = fieldRow(doc, 'Caution (dépôt):', `${contract.deposit || 2400} MAD`, 14, y)
  y = fieldRow(doc, 'Mode de paiement:', contract.paymentMethod || 'Carte bancaire', 14, y)
  if (vehicle && vehicle.maxKmEnabled && vehicle.maxKmPerDay) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GRAY)
    doc.text(`Kilométrage max autorisé : ${vehicle.maxKmPerDay} km/jour — tout dépassement sera facturé 2 MAD/km`, 14, y)
    y += 6
  }
  y += 3

  // Article 5 — Assurance
  y = sectionTitle(doc, 'ARTICLE 5 — ASSURANCE', y)
  y = fieldRow(doc, 'Couverture:', 'Tous risques avec franchise', 14, y)
  y = fieldRow(doc, 'Responsabilité civile:', 'Incluse', 14, y)
  y = fieldRow(doc, 'N° Police d\'assurance:', agency.insurance_policy || '—', 14, y)
  y = fieldRow(doc, 'PAI (personnes transportées):', contract.pai ? 'Incluse' : 'Non souscrite', 14, y)
  y = fieldRow(doc, 'CDW (dommages):', contract.cdw ? 'Incluse' : 'Franchise applicable', 14, y)
  y += 3

  // Article 6 — Clauses légales
  if (y > 215) { doc.addPage(); y = 20 }
  y = sectionTitle(doc, 'ARTICLE 6 — OBLIGATIONS ET CLAUSES LÉGALES', y)
  const clauses = [
    'Le locataire s\'engage à utiliser le véhicule conformément au Code de la Route marocain.',
    'Il est interdit de conduire hors du territoire marocain sans autorisation écrite du loueur.',
    'Le locataire est seul responsable des amendes et contraventions établies à son encontre.',
    'En cas d\'accident : déclaration obligatoire dans les 24h, constat écrit sous 48h.',
    'Le véhicule doit être restitué avec le même niveau de carburant qu\'à la prise en charge.',
    'Toute journée commencée est due. La location est calculée par tranches de 24 heures.',
    `Protection des données (Loi 09-08) : Les données collectées sont traitées par ${agency.name} dans le cadre exclusif de la location. Le locataire consent à leur traitement et conservation pendant 5 ans.`,
    `En cas de litige, les tribunaux de ${agency.city || 'Casablanca'} seront seuls compétents.`,
  ]
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(60, 58, 52)
  clauses.forEach(cl => {
    const lines = doc.splitTextToSize(`• ${cl}`, 182)
    if (y + lines.length * 4.5 > 280) { doc.addPage(); y = 20 }
    doc.text(lines, 14, y)
    y += lines.length * 4.2 + 1
  })

  // ── Page 2: État des lieux ──────────────────────────────
  doc.addPage()
  y = header(doc, agency, 'ÉTAT DES LIEUX — VÉHICULE', contract.contractNumber)

  y = sectionTitle(doc, 'ÉTAT DES LIEUX À LA REMISE DU VÉHICULE', y)

  // Car diagram — centred in top section
  drawCarDiagram(doc, 105, y + 42)
  y += 90

  // Fuel gauge
  y = drawFuelGauge(doc, 14, y, contract.fuelLevel || 'Plein')
  y += 4

  // Mileage fields
  y = fieldRow(doc, 'Kilométrage départ:', `${contract.mileageOut || vehicle.mileage || '—'} km`, 14, y)

  // Kilométrage retour — blank line for manual fill
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...GRAY)
  doc.text('Kilométrage retour:', 14, y)
  doc.setDrawColor(...GRAY)
  doc.setLineWidth(0.3)
  doc.line(14 + 85, y, 196, y)
  y += 8

  // Zone inspection table
  y = sectionTitle(doc, 'INSPECTION PAR ZONE', y)

  autoTable(doc, {
    startY: y,
    margin: { left: 14, right: 14 },
    head: [['Zone', 'RAS ☐', 'Rayure ☐', 'Bosselure ☐', 'Bris / Autre ☐', 'Remarques']],
    body: [
      ['A — AVANT',     '☐', '☐', '☐', '☐', ''],
      ['B — ARRIÈRE',   '☐', '☐', '☐', '☐', ''],
      ['C — CÔTÉ G',    '☐', '☐', '☐', '☐', ''],
      ['D — CÔTÉ D',    '☐', '☐', '☐', '☐', ''],
      ['E — TOIT',      '☐', '☐', '☐', '☐', ''],
    ],
    headStyles: { fillColor: DARK, textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 9, textColor: DARK, minCellHeight: 10 },
    alternateRowStyles: { fillColor: [250, 249, 246] },
    columnStyles: {
      0: { cellWidth: 38, fontStyle: 'bold' },
      1: { cellWidth: 18, halign: 'center' },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 22, halign: 'center' },
      4: { cellWidth: 26, halign: 'center' },
      5: { cellWidth: 'auto' },
    },
  })

  y = doc.lastAutoTable.finalY + 10

  // ── Photos section ────────────────────────────────────
  const photoEntries = contract.photos ? Object.entries(contract.photos).filter(([, v]) => v) : []
  if (photoEntries.length > 0) {
    const PHOTO_LABELS = { front: 'Avant', rear: 'Arrière', left: 'Côté gauche', right: 'Côté droit', interior: 'Intérieur', damage: 'Détail / Dommage' }
    if (y > 200) { doc.addPage(); y = 20 }
    y = sectionTitle(doc, 'PHOTOS DU VÉHICULE', y)

    const colW = 86; const rowH = 52; const gap = 10
    const startX = 14
    let col = 0

    for (const [id, dataUrl] of photoEntries) {
      const px = startX + col * (colW + gap)
      if (y + rowH > 285) { doc.addPage(); y = 20 }
      try {
        doc.addImage(dataUrl, 'JPEG', px, y, colW, rowH - 8)
      } catch (_) { /* skip broken image */ }
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(...GRAY)
      doc.text(PHOTO_LABELS[id] || id, px + colW / 2, y + rowH - 1, { align: 'center' })
      col++
      if (col >= 2) { col = 0; y += rowH + 4 }
    }
    if (col > 0) y += rowH + 4
    y += 4
  }

  // Signatures on page 2
  if (y > 250) { doc.addPage(); y = 20 }
  // Agency signature image (centred in the loueur zone x=14..80, above the line)
  if (defaultSignature) {
    try {
      doc.addImage(defaultSignature, 'PNG', 27, y, 40, 15)
    } catch (_) { /* skip if image is broken */ }
  }
  doc.setDrawColor(...GRAY)
  doc.setLineWidth(0.3)
  doc.line(14, y + 14, 80, y + 14)
  doc.line(130, y + 14, 196, y + 14)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...GRAY)
  doc.text('Signature du loueur', 47, y + 19, { align: 'center' })
  doc.text('Signature du locataire\n(Lu et approuvé)', 163, y + 19, { align: 'center' })
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7)
  doc.text(
    `Établi le ${new Date().toLocaleDateString('fr-MA')} à ${agency.city || 'Casablanca'}`,
    105, y + 28, { align: 'center' }
  )

  doc.save(`${contract.contractNumber}.pdf`)
}

// ── Invoice ───────────────────────────────────────────────

export async function generateInvoice(invoice, contract, client, vehicle, agency) {
  const { defaultSignature } = (await getGeneralConfig()) || {}
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  // ── Custom header for invoice (includes invoice number top-right prominently) ──
  doc.setFillColor(...DARK)
  doc.rect(0, 0, 210, 28, 'F')

  // Agency name
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(255, 255, 255)
  doc.text(agency.name || 'Car Rental Agency', 14, 10)

  // Agency sub-details
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(200, 195, 185)
  const agencyLine1 = [agency.address, agency.phone, agency.email].filter(Boolean).join('  |  ')
  const agencyLine2 = [
    agency.ice   ? `ICE: ${agency.ice}`     : null,
    agency.rc    ? `RC: ${agency.rc}`       : null,
    agency.if_number ? `IF: ${agency.if_number}` : null,
    agency.patente   ? `Patente: ${agency.patente}` : null,
  ].filter(Boolean).join('  |  ')
  doc.text(agencyLine1, 14, 17)
  doc.text(agencyLine2, 14, 23)

  // Invoice number — prominent top right
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(255, 255, 255)
  doc.text(invoice.invoiceNumber, 196, 10, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(200, 195, 185)
  doc.text(`Date: ${new Date().toLocaleDateString('fr-MA')}`, 196, 17, { align: 'right' })

  // Accent bar
  doc.setFillColor(...ACCENT)
  doc.rect(0, 28, 210, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  doc.text('FACTURE DE LOCATION', 105, 33.5, { align: 'center' })

  let y = 44

  // Client info
  y = sectionTitle(doc, 'FACTURÉ À', y)
  y = fieldRow(doc, 'Client:', `${client.firstName} ${client.lastName}`, 14, y)
  y = fieldRow(doc, 'CIN:', client.cinNumber, 14, y)
  y = fieldRow(doc, 'Tél:', client.phone, 14, y)
  y = fieldRow(doc, 'Email:', client.email, 14, y)
  y = fieldRow(doc, 'Réf. contrat:', contract.contractNumber, 14, y)
  y += 4

  // Items table with explicit TVA row
  autoTable(doc, {
    startY: y,
    margin: { left: 14, right: 14 },
    head: [['Description', 'Qté', 'P.U (MAD)', 'Total HT (MAD)']],
    body: [
      [
        `Location ${vehicle.make} ${vehicle.model} — ${displayPlate(vehicle.plate)}`,
        `${contract.days} j`,
        String(vehicle.dailyRate),
        String(contract.totalHT),
      ],
      ...(contract.pai ? [['Assurance PAI', '1', String(contract.paiRate || 50), String((contract.paiRate || 50) * contract.days)]] : []),
      ...(contract.cdw ? [['Garantie CDW', '1', String(contract.cdwRate || 80), String((contract.cdwRate || 80) * contract.days)]] : []),
      ...(contract.extras?.fuel   ? [['Supplément carburant', '1', String(contract.extras.fuelAmount || 0), String(contract.extras.fuelAmount || 0)]] : []),
      ...(contract.extras?.driver ? [['Conducteur supplémentaire', '1', '100', String(100 * contract.days)]] : []),
    ],
    foot: [
      ['', '', 'Total HT',  `${contract.totalHT} MAD`],
      ['', '', 'TVA (20%)', `${contract.tva} MAD`],
      ['', '', 'TOTAL TTC', `${contract.totalTTC} MAD`],
    ],
    headStyles: { fillColor: DARK, textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
    footStyles: { fillColor: LIGHT, textColor: DARK, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: DARK },
    alternateRowStyles: { fillColor: [250, 249, 246] },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 18, halign: 'center' },
      2: { cellWidth: 30, halign: 'right' },
      3: { cellWidth: 36, halign: 'right' },
    },
  })

  y = doc.lastAutoTable.finalY + 8

  // Amount in words
  const wordsLine = amountInWords(contract.totalTTC)
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  doc.setTextColor(...DARK)
  const wordsWrapped = doc.splitTextToSize(
    `Arrêtée la présente facture à la somme de : ${wordsLine}`,
    182
  )
  doc.text(wordsWrapped, 14, y)
  y += wordsWrapped.length * 5 + 6

  // Cachet et signature box (bottom right)
  const boxW = 60; const boxH = 25
  const boxX = 196 - boxW
  doc.setDrawColor(...GRAY)
  doc.setLineWidth(0.4)
  doc.rect(boxX, y, boxW, boxH)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...GRAY)
  doc.text('Cachet et signature', boxX + boxW / 2, y + 5, { align: 'center' })
  // Agency signature image — centred inside the box, below the label
  if (defaultSignature) {
    try {
      doc.addImage(defaultSignature, 'PNG', boxX + 10, y + 7, 40, 15)
    } catch (_) { /* skip if image is broken */ }
  }

  y += boxH + 8

  // Closing note
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7.5)
  doc.setTextColor(...GRAY)
  doc.text('Merci de votre confiance. Conservez cette facture comme justificatif de paiement.', 105, y, { align: 'center' })

  // Legal footer — centred at bottom
  const footerY = 285
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(...GRAY)
  const footerParts = [
    agency.ice     ? `ICE: ${agency.ice}`           : null,
    agency.rc      ? `RC: ${agency.rc}`             : null,
    agency.if_number ? `IF: ${agency.if_number}`    : null,
    agency.patente   ? `Patente: ${agency.patente}` : null,
  ].filter(Boolean)
  doc.text(footerParts.join('  |  '), 105, footerY, { align: 'center' })

  doc.save(`${invoice.invoiceNumber}.pdf`)
}

// ── Buffer variants (for WhatsApp upload — no file download) ──────────────

/**
 * Same as generateContract but returns an ArrayBuffer instead of saving a file.
 * Used when we need to upload the PDF bytes to Supabase Storage.
 */
export async function generateContractBuffer(contract, client, vehicle, agency) {
  const { defaultSignature } = (await getGeneralConfig()) || {}
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  let y = header(doc, agency, 'CONTRAT DE LOCATION DE VÉHICULE', contract.contractNumber)

  y = sectionTitle(doc, 'ARTICLE 1 — PARTIES', y)
  y = fieldRow(doc, 'Loueur:', agency.name, 14, y)
  y = fieldRow(doc, 'Adresse:', agency.address, 14, y)
  y = fieldRow(doc, 'RC / ICE:', `${agency.rc || ''}  /  ${agency.ice || ''}`, 14, y)
  y += 2
  y = fieldRow(doc, 'Locataire:', `${client.firstName} ${client.lastName}`, 14, y)
  y = fieldRow(doc, 'CIN / Passeport:', client.cinNumber, 14, y)
  y = fieldRow(doc, 'Expiry CIN:', client.cinExpiry || '—', 14, y)
  y = fieldRow(doc, 'Permis de conduire:', client.drivingLicenseNumber, 14, y)
  y = fieldRow(doc, 'Expiry Permis:', client.licenseExpiry || '—', 14, y)
  y = fieldRow(doc, 'Tél:', client.phone, 14, y)
  y = fieldRow(doc, 'Email:', client.email, 14, y)
  y += 3

  y = sectionTitle(doc, 'ARTICLE 2 — VÉHICULE', y)
  y = fieldRow(doc, 'Véhicule:', `${vehicle.make} ${vehicle.model} (${vehicle.year})`, 14, y)
  y = fieldRow(doc, 'Immatriculation:', displayPlate(vehicle.plate), 14, y)
  y = fieldRow(doc, 'Couleur:', vehicle.color, 14, y)
  y = fieldRow(doc, 'Carburant:', vehicle.fuelType, 14, y)
  y = fieldRow(doc, 'Kilométrage départ:', `${contract.mileageOut || vehicle.mileage || '—'} km`, 14, y)
  y += 3

  y = sectionTitle(doc, 'ARTICLE 3 — CONDITIONS DE LOCATION', y)
  y = fieldRow(doc, 'Date de départ:', contract.startDate, 14, y)
  y = fieldRow(doc, 'Heure de départ:', contract.startTime || '—', 14, y)
  y = fieldRow(doc, 'Date de retour:', contract.endDate, 14, y)
  y = fieldRow(doc, 'Heure de retour:', contract.endTime || '—', 14, y)
  y = fieldRow(doc, 'Durée:', `${contract.days} jour(s)`, 14, y)
  y = fieldRow(doc, 'Niveau carburant départ:', contract.fuelLevel || '—', 14, y)
  y = fieldRow(doc, 'Lieu de départ:', contract.pickupLocation || agency.city, 14, y)
  y = fieldRow(doc, 'Lieu de retour:', contract.returnLocation || agency.city, 14, y)
  y += 3

  y = sectionTitle(doc, 'ARTICLE 4 — TARIF ET CAUTION', y)
  y = fieldRow(doc, 'Tarif journalier:', `${vehicle.dailyRate} MAD / jour`, 14, y)
  y = fieldRow(doc, 'Montant total (HT):', `${contract.totalHT} MAD`, 14, y)
  y = fieldRow(doc, 'TVA (20%):', `${contract.tva} MAD`, 14, y)
  y = fieldRow(doc, 'Total TTC:', `${contract.totalTTC} MAD`, 14, y)
  y = fieldRow(doc, 'Caution (dépôt):', `${contract.deposit || 2400} MAD`, 14, y)
  y = fieldRow(doc, 'Mode de paiement:', contract.paymentMethod || 'Carte bancaire', 14, y)
  if (vehicle && vehicle.maxKmEnabled && vehicle.maxKmPerDay) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GRAY)
    doc.text(`Kilométrage max autorisé : ${vehicle.maxKmPerDay} km/jour — tout dépassement sera facturé 2 MAD/km`, 14, y)
    y += 6
  }
  y += 3

  y = sectionTitle(doc, 'ARTICLE 5 — ASSURANCE', y)
  y = fieldRow(doc, 'Couverture:', 'Tous risques avec franchise', 14, y)
  y = fieldRow(doc, 'Responsabilité civile:', 'Incluse', 14, y)
  y = fieldRow(doc, 'N° Police d\'assurance:', agency.insurance_policy || '—', 14, y)
  y = fieldRow(doc, 'PAI (personnes transportées):', contract.pai ? 'Incluse' : 'Non souscrite', 14, y)
  y = fieldRow(doc, 'CDW (dommages):', contract.cdw ? 'Incluse' : 'Franchise applicable', 14, y)
  y += 3

  if (y > 215) { doc.addPage(); y = 20 }
  y = sectionTitle(doc, 'ARTICLE 6 — OBLIGATIONS ET CLAUSES LÉGALES', y)
  const clauses = [
    'Le locataire s\'engage à utiliser le véhicule conformément au Code de la Route marocain.',
    'Il est interdit de conduire hors du territoire marocain sans autorisation écrite du loueur.',
    'Le locataire est seul responsable des amendes et contraventions établies à son encontre.',
    'En cas d\'accident : déclaration obligatoire dans les 24h, constat écrit sous 48h.',
    'Le véhicule doit être restitué avec le même niveau de carburant qu\'à la prise en charge.',
    'Toute journée commencée est due. La location est calculée par tranches de 24 heures.',
    `Protection des données (Loi 09-08) : Les données collectées sont traitées par ${agency.name} dans le cadre exclusif de la location. Le locataire consent à leur traitement et conservation pendant 5 ans.`,
    `En cas de litige, les tribunaux de ${agency.city || 'Casablanca'} seront seuls compétents.`,
  ]
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(60, 58, 52)
  clauses.forEach(cl => {
    const lines = doc.splitTextToSize(`• ${cl}`, 182)
    if (y + lines.length * 4.5 > 280) { doc.addPage(); y = 20 }
    doc.text(lines, 14, y)
    y += lines.length * 4.2 + 1
  })

  doc.addPage()
  y = header(doc, agency, 'ÉTAT DES LIEUX — VÉHICULE', contract.contractNumber)
  y = sectionTitle(doc, 'ÉTAT DES LIEUX À LA REMISE DU VÉHICULE', y)
  drawCarDiagram(doc, 105, y + 42)
  y += 90
  y = drawFuelGauge(doc, 14, y, contract.fuelLevel || 'Plein')
  y += 4
  y = fieldRow(doc, 'Kilométrage départ:', `${contract.mileageOut || vehicle.mileage || '—'} km`, 14, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...GRAY)
  doc.text('Kilométrage retour:', 14, y)
  doc.setDrawColor(...GRAY)
  doc.setLineWidth(0.3)
  doc.line(14 + 85, y, 196, y)
  y += 8
  y = sectionTitle(doc, 'INSPECTION PAR ZONE', y)
  autoTable(doc, {
    startY: y,
    margin: { left: 14, right: 14 },
    head: [['Zone', 'RAS ☐', 'Rayure ☐', 'Bosselure ☐', 'Bris / Autre ☐', 'Remarques']],
    body: [
      ['A — AVANT', '☐', '☐', '☐', '☐', ''],
      ['B — ARRIÈRE', '☐', '☐', '☐', '☐', ''],
      ['C — CÔTÉ G', '☐', '☐', '☐', '☐', ''],
      ['D — CÔTÉ D', '☐', '☐', '☐', '☐', ''],
      ['E — TOIT', '☐', '☐', '☐', '☐', ''],
    ],
    headStyles: { fillColor: DARK, textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 9, textColor: DARK, minCellHeight: 10 },
    alternateRowStyles: { fillColor: [250, 249, 246] },
    columnStyles: {
      0: { cellWidth: 38, fontStyle: 'bold' },
      1: { cellWidth: 18, halign: 'center' },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 22, halign: 'center' },
      4: { cellWidth: 26, halign: 'center' },
      5: { cellWidth: 'auto' },
    },
  })
  y = doc.lastAutoTable.finalY + 10

  const photoEntries = contract.photos ? Object.entries(contract.photos).filter(([, v]) => v) : []
  if (photoEntries.length > 0) {
    const PHOTO_LABELS = { front: 'Avant', rear: 'Arrière', left: 'Côté gauche', right: 'Côté droit', interior: 'Intérieur', damage: 'Détail / Dommage' }
    if (y > 200) { doc.addPage(); y = 20 }
    y = sectionTitle(doc, 'PHOTOS DU VÉHICULE', y)
    const colW = 86; const rowH = 52; const gap = 10
    const startX = 14
    let col = 0
    for (const [id, dataUrl] of photoEntries) {
      const px = startX + col * (colW + gap)
      if (y + rowH > 285) { doc.addPage(); y = 20 }
      try { doc.addImage(dataUrl, 'JPEG', px, y, colW, rowH - 8) } catch (_) { /* skip */ }
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(...GRAY)
      doc.text(PHOTO_LABELS[id] || id, px + colW / 2, y + rowH - 1, { align: 'center' })
      col++
      if (col >= 2) { col = 0; y += rowH + 4 }
    }
    if (col > 0) y += rowH + 4
    y += 4
  }

  if (y > 250) { doc.addPage(); y = 20 }
  if (defaultSignature) {
    try { doc.addImage(defaultSignature, 'PNG', 27, y, 40, 15) } catch (_) { /* skip */ }
  }
  doc.setDrawColor(...GRAY)
  doc.setLineWidth(0.3)
  doc.line(14, y + 14, 80, y + 14)
  doc.line(130, y + 14, 196, y + 14)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...GRAY)
  doc.text('Signature du loueur', 47, y + 19, { align: 'center' })
  doc.text('Signature du locataire\n(Lu et approuvé)', 163, y + 19, { align: 'center' })
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7)
  doc.text(
    `Établi le ${new Date().toLocaleDateString('fr-MA')} à ${agency.city || 'Casablanca'}`,
    105, y + 28, { align: 'center' }
  )

  return doc.output('arraybuffer')
}

/**
 * Same as generateInvoice but returns an ArrayBuffer instead of saving a file.
 */
export async function generateInvoiceBuffer(invoice, contract, client, vehicle, agency) {
  const { defaultSignature } = (await getGeneralConfig()) || {}
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  doc.setFillColor(...DARK)
  doc.rect(0, 0, 210, 28, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(255, 255, 255)
  doc.text(agency.name || 'Car Rental Agency', 14, 10)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(200, 195, 185)
  const agencyLine1 = [agency.address, agency.phone, agency.email].filter(Boolean).join('  |  ')
  const agencyLine2 = [
    agency.ice       ? `ICE: ${agency.ice}`           : null,
    agency.rc        ? `RC: ${agency.rc}`             : null,
    agency.if_number ? `IF: ${agency.if_number}`      : null,
    agency.patente   ? `Patente: ${agency.patente}`   : null,
  ].filter(Boolean).join('  |  ')
  doc.text(agencyLine1, 14, 17)
  doc.text(agencyLine2, 14, 23)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(255, 255, 255)
  doc.text(invoice.invoiceNumber, 196, 10, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(200, 195, 185)
  doc.text(`Date: ${new Date().toLocaleDateString('fr-MA')}`, 196, 17, { align: 'right' })
  doc.setFillColor(...ACCENT)
  doc.rect(0, 28, 210, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  doc.text('FACTURE DE LOCATION', 105, 33.5, { align: 'center' })

  let y = 44
  y = sectionTitle(doc, 'FACTURÉ À', y)
  y = fieldRow(doc, 'Client:', `${client.firstName} ${client.lastName}`, 14, y)
  y = fieldRow(doc, 'CIN:', client.cinNumber, 14, y)
  y = fieldRow(doc, 'Tél:', client.phone, 14, y)
  y = fieldRow(doc, 'Email:', client.email, 14, y)
  y = fieldRow(doc, 'Réf. contrat:', contract.contractNumber, 14, y)
  y += 4

  autoTable(doc, {
    startY: y,
    margin: { left: 14, right: 14 },
    head: [['Description', 'Qté', 'P.U (MAD)', 'Total HT (MAD)']],
    body: [
      [
        `Location ${vehicle.make} ${vehicle.model} — ${displayPlate(vehicle.plate)}`,
        `${contract.days} j`,
        String(vehicle.dailyRate),
        String(contract.totalHT),
      ],
      ...(contract.pai ? [['Assurance PAI', '1', String(contract.paiRate || 50), String((contract.paiRate || 50) * contract.days)]] : []),
      ...(contract.cdw ? [['Garantie CDW', '1', String(contract.cdwRate || 80), String((contract.cdwRate || 80) * contract.days)]] : []),
      ...(contract.extras?.fuel   ? [['Supplément carburant', '1', String(contract.extras.fuelAmount || 0), String(contract.extras.fuelAmount || 0)]] : []),
      ...(contract.extras?.driver ? [['Conducteur supplémentaire', '1', '100', String(100 * contract.days)]] : []),
    ],
    foot: [
      ['', '', 'Total HT',  `${contract.totalHT} MAD`],
      ['', '', 'TVA (20%)', `${contract.tva} MAD`],
      ['', '', 'TOTAL TTC', `${contract.totalTTC} MAD`],
    ],
    headStyles: { fillColor: DARK, textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
    footStyles: { fillColor: LIGHT, textColor: DARK, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: DARK },
    alternateRowStyles: { fillColor: [250, 249, 246] },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 18, halign: 'center' },
      2: { cellWidth: 30, halign: 'right' },
      3: { cellWidth: 36, halign: 'right' },
    },
  })

  y = doc.lastAutoTable.finalY + 8
  const wordsLine = amountInWords(contract.totalTTC)
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  doc.setTextColor(...DARK)
  const wordsWrapped = doc.splitTextToSize(`Arrêtée la présente facture à la somme de : ${wordsLine}`, 182)
  doc.text(wordsWrapped, 14, y)
  y += wordsWrapped.length * 5 + 6

  const boxW = 60; const boxH = 25
  const boxX = 196 - boxW
  doc.setDrawColor(...GRAY)
  doc.setLineWidth(0.4)
  doc.rect(boxX, y, boxW, boxH)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...GRAY)
  doc.text('Cachet et signature', boxX + boxW / 2, y + 5, { align: 'center' })
  if (defaultSignature) {
    try { doc.addImage(defaultSignature, 'PNG', boxX + 10, y + 7, 40, 15) } catch (_) { /* skip */ }
  }
  y += boxH + 8
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7.5)
  doc.setTextColor(...GRAY)
  doc.text('Merci de votre confiance. Conservez cette facture comme justificatif de paiement.', 105, y, { align: 'center' })

  const footerY = 285
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(...GRAY)
  const footerParts = [
    agency.ice       ? `ICE: ${agency.ice}`           : null,
    agency.rc        ? `RC: ${agency.rc}`             : null,
    agency.if_number ? `IF: ${agency.if_number}`      : null,
    agency.patente   ? `Patente: ${agency.patente}`   : null,
  ].filter(Boolean)
  doc.text(footerParts.join('  |  '), 105, footerY, { align: 'center' })

  return doc.output('arraybuffer')
}

/**
 * Same as generateRestitutionPDF (defined in Restitution.jsx) but returns an ArrayBuffer.
 * Used for WhatsApp sending without triggering a file download.
 */
export async function generateRestitutionPDFBuffer({ agency = {}, contract, returnDate, returnTime, returnMileage, returnFuelLevel,
  returnDamages, extraKmFee, fuelFee, damageFee, totalExtraFees, extraKm, fuelDiff }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const ACCENT = [199, 75, 31]
  const GRAY_C = [120, 116, 108]
  const LIGHT_C = [245, 243, 238]

  doc.setFillColor(...ACCENT)
  doc.rect(0, 0, 210, 28, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('PROCÈS-VERBAL DE RESTITUTION', 14, 12)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(agency.name || 'Agence', 14, 19)
  doc.text(`Contrat: ${contract.contractNumber || '—'}`, 14, 24)
  doc.setTextColor(...DARK)

  let y = 36

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...GRAY_C)
  doc.text('CLIENT', 14, y)
  doc.text('VÉHICULE', 110, y)
  y += 4
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...DARK)
  doc.text(contract.clientName || '—', 14, y)
  doc.text(contract.vehicleName || '—', 110, y)
  y += 9

  doc.autoTable({
    startY: y,
    head: [['', 'Départ', 'Retour']],
    body: [
      ['Date', contract.startDate || '—', returnDate || '—'],
      ['Heure', contract.startTime || '—', returnTime || '—'],
      ['Kilométrage', `${contract.startMileage || contract.mileageOut || '—'} km`, `${returnMileage || '—'} km`],
      ['Carburant', contract.fuelLevel || '—', returnFuelLevel || '—'],
    ],
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: ACCENT, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: LIGHT_C },
    margin: { left: 14, right: 14 },
    theme: 'grid',
  })
  y = doc.lastAutoTable.finalY + 8

  const damagedZones = (returnDamages || []).filter(d => d.checked)
  if (damagedZones.length > 0) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...GRAY_C)
    doc.text('DOMMAGES CONSTATÉS', 14, y)
    y += 3
    doc.autoTable({
      startY: y,
      head: [['Zone', 'Description']],
      body: damagedZones.map(d => [d.zone, d.description || '—']),
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [180, 60, 20], textColor: 255, fontStyle: 'bold' },
      margin: { left: 14, right: 14 },
      theme: 'grid',
    })
    y = doc.lastAutoTable.finalY + 8
  }

  const feeRows = []
  if (extraKmFee > 0) feeRows.push([`Km supplémentaires (${extraKm} km × 2 MAD)`, `${extraKmFee} MAD`])
  if (fuelFee > 0) feeRows.push([`Manque carburant (${fuelDiff} quart(s) × 100 MAD)`, `${fuelFee} MAD`])
  if (damageFee > 0) feeRows.push([`Frais dommages`, `${damageFee} MAD`])
  feeRows.push([{ content: 'TOTAL FRAIS SUPPLÉMENTAIRES', styles: { fontStyle: 'bold' } }, { content: `${totalExtraFees} MAD`, styles: { fontStyle: 'bold' } }])

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...GRAY_C)
  doc.text('FRAIS SUPPLÉMENTAIRES', 14, y)
  y += 3
  doc.autoTable({
    startY: y,
    body: feeRows,
    styles: { fontSize: 9, cellPadding: 3 },
    alternateRowStyles: { fillColor: LIGHT_C },
    margin: { left: 14, right: 14 },
    theme: 'grid',
  })

  return doc.output('arraybuffer')
}

/**
 * Generate a timestamped AI damage analysis report PDF.
 * Includes side-by-side photo comparison + AI findings table.
 *
 * @param {object} params
 * @param {object} params.agency
 * @param {object} params.contract
 * @param {object} params.analysis  — result from /ai/detect-damage
 * @param {string[]} params.beforePhotos — base64 data-URLs
 * @param {string[]} params.afterPhotos  — base64 data-URLs
 * @returns {void}  — triggers browser download
 */
export function generateDamageReport({ agency = {}, contract, analysis, beforePhotos = [], afterPhotos = [] }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const RED    = [220, 38, 38]
  const GREEN  = [22, 163, 74]
  const ORANGE = [234, 88, 12]

  // ── Header ──
  doc.setFillColor(...DARK)
  doc.rect(0, 0, 210, 28, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(255, 255, 255)
  doc.text('RAPPORT D\'ANALYSE IA — DOMMAGES', 14, 12)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(200, 195, 185)
  doc.text(agency.name || '', 14, 19)
  doc.text(`Généré le ${new Date(analysis.analysedAt).toLocaleString('fr-MA')}`, 14, 24)

  let y = 36

  // ── Contract summary ──
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...GRAY)
  doc.text('CONTRAT', 14, y)
  y += 4
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...DARK)
  doc.text(`${contract.contractNumber || '—'}  ·  ${contract.clientName || '—'}  ·  ${contract.vehicleName || '—'}`, 14, y)
  y += 8

  // ── AI verdict badge ──
  const hasDamage = analysis.hasDamage
  const badgeColor = hasDamage ? RED : GREEN
  doc.setFillColor(...badgeColor)
  doc.roundedRect(14, y, 80, 10, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(255, 255, 255)
  doc.text(hasDamage ? '⚠ DOMMAGES DÉTECTÉS' : '✓ AUCUN DOMMAGE DÉTECTÉ', 54, y + 7, { align: 'center' })

  const confColor = analysis.confidence === 'high' ? GREEN : analysis.confidence === 'medium' ? ORANGE : GRAY
  doc.setFillColor(...confColor)
  doc.roundedRect(100, y, 40, 10, 2, 2, 'F')
  doc.setFontSize(8)
  doc.text(`Confiance: ${analysis.confidence === 'high' ? 'Élevée' : analysis.confidence === 'medium' ? 'Moyenne' : 'Faible'}`, 120, y + 7, { align: 'center' })
  y += 16

  // ── Summary ──
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(9)
  doc.setTextColor(...DARK)
  const summaryLines = doc.splitTextToSize(analysis.summary || '', 182)
  doc.text(summaryLines, 14, y)
  y += summaryLines.length * 5 + 6

  // ── Damage table ──
  if (hasDamage && analysis.damages?.length > 0) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...GRAY)
    doc.text('DOMMAGES IDENTIFIÉS', 14, y)
    y += 3

    doc.autoTable({
      startY: y,
      head: [['Zone', 'Description', 'Sévérité']],
      body: analysis.damages.map(d => [
        d.zone || '—',
        d.description || '—',
        d.severity === 'major' ? 'Majeur' : d.severity === 'minor' ? 'Mineur' : 'Cosmétique',
      ]),
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: RED, textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        2: { halign: 'center', fontStyle: 'bold' },
      },
      didParseCell: (data) => {
        if (data.column.index === 2 && data.section === 'body') {
          const sev = data.cell.raw
          if (sev === 'Majeur') data.cell.styles.textColor = RED
          else if (sev === 'Mineur') data.cell.styles.textColor = ORANGE
        }
      },
      margin: { left: 14, right: 14 },
      theme: 'grid',
    })
    y = doc.lastAutoTable.finalY + 10
  }

  // ── Recommendation ──
  if (analysis.recommendation) {
    doc.setFillColor(245, 243, 238)
    const recLines = doc.splitTextToSize(`Recommandation: ${analysis.recommendation}`, 174)
    doc.rect(14, y - 2, 182, recLines.length * 5 + 6, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...DARK)
    doc.text(recLines, 17, y + 3)
    y += recLines.length * 5 + 12
  }

  // ── Photo comparison (up to 2 before + 2 after) ──
  const addPhoto = (dataUrl, x, py, w, h, label) => {
    try {
      const fmt = dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG'
      doc.addImage(dataUrl, fmt, x, py, w, h)
    } catch (_) { /* skip bad image */ }
    doc.setFontSize(7)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(...GRAY)
    doc.text(label, x + w / 2, py + h + 4, { align: 'center' })
  }

  const photoW = 85
  const photoH = 55
  const maxPairs = Math.min(Math.max(beforePhotos.length, afterPhotos.length), 3)

  for (let i = 0; i < maxPairs; i++) {
    if (y + photoH + 12 > 280) { doc.addPage(); y = 20 }

    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...GRAY)
    doc.text(`PHOTO ${i + 1}`, 14, y)
    y += 3

    if (beforePhotos[i]) addPhoto(beforePhotos[i], 14, y, photoW, photoH, 'AVANT LOCATION')
    if (afterPhotos[i])  addPhoto(afterPhotos[i], 111, y, photoW, photoH, 'APRÈS LOCATION')

    // Draw red border around after photo if damage detected
    if (hasDamage && afterPhotos[i]) {
      doc.setDrawColor(...RED)
      doc.setLineWidth(0.6)
      doc.rect(111, y, photoW, photoH)
    }

    y += photoH + 10
  }

  // ── Footer ──
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7.5)
  doc.setTextColor(...GRAY)
  doc.text('Document généré automatiquement par RentaFlow AI — à conserver comme preuve en cas de litige.', 105, 288, { align: 'center' })

  doc.save(`rapport-dommages-${contract.contractNumber || 'doc'}-${new Date().toISOString().slice(0, 10)}.pdf`)
}

/**
 * Generate a comprehensive timestamped dispute evidence package PDF.
 * Multi-page: cover, before photos, after photos, AI findings, legal summary.
 *
 * @param {object} params
 * @param {object} params.agency
 * @param {object} params.contract
 * @param {object} params.vehicle
 * @param {string[]} params.beforePhotos — base64 data-URLs (fleet reference photos)
 * @param {string[]} params.afterPhotos  — base64 data-URLs (return photos)
 * @param {object} params.aiAnalysis    — result from /ai/detect-damage
 * @returns {void}  — triggers browser download
 */
export function generateDisputePackage({ agency = {}, contract, vehicle, beforePhotos = [], afterPhotos = [], aiAnalysis }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const RED    = [220, 38, 38]
  const GREEN  = [22, 163, 74]
  const ORANGE = [234, 88, 12]
  const SEAL   = [199, 75, 31]

  const generatedAt = new Date()
  const generatedStr = generatedAt.toLocaleString('fr-MA')
  const dateSlug = generatedAt.toISOString().slice(0, 10)

  const FOOTER_TEXT = `Généré le ${generatedStr} par RentaFlow — Document horodaté à valeur probatoire`

  function pageFooter(pageDoc) {
    pageDoc.setFont('helvetica', 'italic')
    pageDoc.setFontSize(7)
    pageDoc.setTextColor(...GRAY)
    pageDoc.text(FOOTER_TEXT, 105, 291, { align: 'center' })
    pageDoc.setDrawColor(...GRAY)
    pageDoc.setLineWidth(0.2)
    pageDoc.line(14, 288, 196, 288)
  }

  function photoGrid(pageDoc, photos, startY, dateLabel) {
    const photoW = 84
    const photoH = 56
    let y = startY
    const cols = 2
    for (let i = 0; i < photos.length; i++) {
      const col = i % cols
      const x = col === 0 ? 14 : 112
      if (col === 0 && i > 0) y += photoH + 12
      if (y + photoH > 278) { pageFooter(pageDoc); pageDoc.addPage(); y = 20 }
      try {
        const fmt = photos[i].startsWith('data:image/png') ? 'PNG' : 'JPEG'
        pageDoc.addImage(photos[i], fmt, x, y, photoW, photoH)
      } catch (_) {
        pageDoc.setFillColor(230, 228, 222)
        pageDoc.rect(x, y, photoW, photoH, 'F')
        pageDoc.setFont('helvetica', 'italic')
        pageDoc.setFontSize(8)
        pageDoc.setTextColor(...GRAY)
        pageDoc.text('Photo non disponible', x + photoW / 2, y + photoH / 2, { align: 'center' })
      }
      pageDoc.setFont('helvetica', 'italic')
      pageDoc.setFontSize(7)
      pageDoc.setTextColor(...GRAY)
      pageDoc.text(`Photo ${i + 1}`, x + photoW / 2, y + photoH + 4, { align: 'center' })
    }
    return y + photoH + 10
  }

  // ── PAGE 1: Cover ──────────────────────────────────────
  // Dark header band
  doc.setFillColor(...DARK)
  doc.rect(0, 0, 210, 40, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(255, 255, 255)
  doc.text('DOSSIER DE LITIGE', 105, 14, { align: 'center' })
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(200, 195, 185)
  doc.text('PREUVE HORODATÉE', 105, 21, { align: 'center' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(255, 255, 255)
  doc.text(agency.name || '', 14, 33)
  doc.text(generatedStr, 196, 33, { align: 'right' })

  // Accent sub-bar
  doc.setFillColor(...SEAL)
  doc.rect(0, 40, 210, 6, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(255, 255, 255)
  doc.text('Document généré automatiquement — à conserver pour usage légal et administratif', 105, 44.5, { align: 'center' })

  let y = 56

  // Digital seal box
  doc.setFillColor(245, 243, 238)
  doc.roundedRect(14, y, 182, 28, 3, 3, 'F')
  doc.setDrawColor(...SEAL)
  doc.setLineWidth(0.6)
  doc.roundedRect(14, y, 182, 28, 3, 3, 'D')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...SEAL)
  doc.text('🔐 CACHET NUMÉRIQUE', 105, y + 8, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...DARK)
  doc.text(`Horodatage: ${generatedStr}`, 105, y + 15, { align: 'center' })
  doc.text(`Référence contrat: ${contract.contractNumber || '—'}   |   Agence: ${agency.name || '—'}`, 105, y + 21, { align: 'center' })
  y += 36

  // Contract info section
  y = sectionTitle(doc, 'INFORMATIONS DU CONTRAT', y)
  y = fieldRow(doc, 'N° Contrat:', contract.contractNumber || '—', 14, y)
  y = fieldRow(doc, 'Client:', contract.clientName || '—', 14, y)
  y = fieldRow(doc, 'Véhicule:', contract.vehicleName || '—', 14, y)
  if (vehicle?.plate) {
    y = fieldRow(doc, 'Immatriculation:', displayPlate(vehicle.plate), 14, y)
  }
  y = fieldRow(doc, 'Date de départ:', contract.startDate || '—', 14, y)
  y = fieldRow(doc, 'Date de retour:', contract.returnDate || contract.endDate || '—', 14, y)
  y += 4

  // AI verdict summary on cover page
  if (aiAnalysis) {
    y = sectionTitle(doc, 'RÉSULTAT DE L\'ANALYSE IA', y)
    const hasDamage = aiAnalysis.hasDamage
    doc.setFillColor(...(hasDamage ? RED : GREEN))
    doc.roundedRect(14, y, 182, 12, 2, 2, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(255, 255, 255)
    doc.text(
      hasDamage ? '⚠ DOMMAGES DÉTECTÉS — VOIR DÉTAILS PAGE 4' : '✓ AUCUN DOMMAGE DÉTECTÉ',
      105, y + 8, { align: 'center' }
    )
    y += 16
    if (aiAnalysis.summary) {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(9)
      doc.setTextColor(...DARK)
      const lines = doc.splitTextToSize(aiAnalysis.summary, 182)
      doc.text(lines, 14, y)
      y += lines.length * 5 + 4
    }
  }

  // Table of contents
  y += 4
  y = sectionTitle(doc, 'TABLE DES MATIÈRES', y)
  const toc = [
    ['Page 1', 'Page de garde — Informations du contrat et résultat IA'],
    ['Page 2', `Photos au départ — ${contract.startDate || '—'} (photos de référence)`],
    ['Page 3', `Photos au retour — ${contract.returnDate || contract.endDate || '—'}`],
    ['Page 4', 'Analyse IA détaillée — Dommages identifiés par zone'],
    ['Page 5', 'Récapitulatif et mentions légales'],
  ]
  doc.autoTable({
    startY: y,
    body: toc,
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 20 } },
    alternateRowStyles: { fillColor: LIGHT },
    margin: { left: 14, right: 14 },
    theme: 'grid',
  })

  pageFooter(doc)

  // ── PAGE 2: Before photos ──────────────────────────────
  doc.addPage()
  doc.setFillColor(...DARK)
  doc.rect(0, 0, 210, 18, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(255, 255, 255)
  doc.text('PHOTOS AU DÉPART', 105, 8, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(200, 195, 185)
  doc.text(`Date de départ: ${contract.startDate || '—'}  |  ${contract.vehicleName || '—'}  |  État avant location`, 105, 14, { align: 'center' })

  if (beforePhotos.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(10)
    doc.setTextColor(...GRAY)
    doc.text('Aucune photo de référence disponible pour ce véhicule.', 105, 60, { align: 'center' })
    doc.setFontSize(8)
    doc.text('Conseil : ajoutez des photos de référence dans la fiche véhicule (Parc automobile).', 105, 70, { align: 'center' })
  } else {
    photoGrid(doc, beforePhotos, 26, contract.startDate)
  }
  pageFooter(doc)

  // ── PAGE 3: After photos ───────────────────────────────
  doc.addPage()
  doc.setFillColor(...DARK)
  doc.rect(0, 0, 210, 18, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(255, 255, 255)
  doc.text('PHOTOS AU RETOUR', 105, 8, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(200, 195, 185)
  doc.text(`Date de retour: ${contract.returnDate || contract.endDate || '—'}  |  ${contract.vehicleName || '—'}  |  État après location`, 105, 14, { align: 'center' })

  if (afterPhotos.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(10)
    doc.setTextColor(...GRAY)
    doc.text('Aucune photo de retour disponible.', 105, 60, { align: 'center' })
  } else {
    photoGrid(doc, afterPhotos, 26, contract.returnDate || contract.endDate)
  }
  // Red border emphasis if damage detected
  if (aiAnalysis?.hasDamage && afterPhotos.length > 0) {
    doc.setDrawColor(...RED)
    doc.setLineWidth(1.5)
    doc.rect(12, 22, 186, 4)
    doc.setLineWidth(0.2)
  }
  pageFooter(doc)

  // ── PAGE 4: AI findings ────────────────────────────────
  doc.addPage()
  doc.setFillColor(...DARK)
  doc.rect(0, 0, 210, 18, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(255, 255, 255)
  doc.text('ANALYSE IA — DOMMAGES IDENTIFIÉS', 105, 8, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(200, 195, 185)
  const analysedStr = aiAnalysis?.analysedAt ? new Date(aiAnalysis.analysedAt).toLocaleString('fr-MA') : generatedStr
  doc.text(`Analyse effectuée le: ${analysedStr}`, 105, 14, { align: 'center' })

  let y4 = 26

  if (!aiAnalysis) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(10)
    doc.setTextColor(...GRAY)
    doc.text('Analyse IA non disponible.', 105, 60, { align: 'center' })
  } else {
    // Verdict badge
    const hasDamage = aiAnalysis.hasDamage
    const badgeColor = hasDamage ? RED : GREEN
    doc.setFillColor(...badgeColor)
    doc.roundedRect(14, y4, 182, 12, 2, 2, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(255, 255, 255)
    doc.text(hasDamage ? '⚠ DOMMAGES DÉTECTÉS' : '✓ AUCUN DOMMAGE DÉTECTÉ', 105, y4 + 8, { align: 'center' })
    y4 += 16

    // Confidence
    const confColor = aiAnalysis.confidence === 'high' ? GREEN : aiAnalysis.confidence === 'medium' ? ORANGE : GRAY
    doc.setFillColor(...confColor)
    doc.roundedRect(14, y4, 50, 8, 2, 2, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(255, 255, 255)
    const confLabel = aiAnalysis.confidence === 'high' ? 'Confiance: Élevée' : aiAnalysis.confidence === 'medium' ? 'Confiance: Moyenne' : 'Confiance: Faible'
    doc.text(confLabel, 39, y4 + 5.5, { align: 'center' })
    y4 += 14

    // Summary
    if (aiAnalysis.summary) {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(9)
      doc.setTextColor(...DARK)
      const lines = doc.splitTextToSize(aiAnalysis.summary, 182)
      doc.text(lines, 14, y4)
      y4 += lines.length * 5 + 6
    }

    // Damage table
    if (hasDamage && aiAnalysis.damages?.length > 0) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(...GRAY)
      doc.text('ZONES ENDOMMAGÉES', 14, y4)
      y4 += 3
      doc.autoTable({
        startY: y4,
        head: [['Zone', 'Description', 'Sévérité']],
        body: aiAnalysis.damages.map(d => [
          d.zone || '—',
          d.description || '—',
          d.severity === 'major' ? 'Majeur' : d.severity === 'minor' ? 'Mineur' : 'Cosmétique',
        ]),
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: RED, textColor: 255, fontStyle: 'bold' },
        columnStyles: { 2: { halign: 'center', fontStyle: 'bold' } },
        didParseCell: (data) => {
          if (data.column.index === 2 && data.section === 'body') {
            const sev = data.cell.raw
            if (sev === 'Majeur') data.cell.styles.textColor = RED
            else if (sev === 'Mineur') data.cell.styles.textColor = ORANGE
          }
        },
        margin: { left: 14, right: 14 },
        theme: 'grid',
      })
      y4 = doc.lastAutoTable.finalY + 10
    }

    // Recommendation
    if (aiAnalysis.recommendation) {
      doc.setFillColor(245, 243, 238)
      const recLines = doc.splitTextToSize(`Recommandation: ${aiAnalysis.recommendation}`, 174)
      doc.rect(14, y4 - 2, 182, recLines.length * 5 + 8, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(...DARK)
      doc.text(recLines, 17, y4 + 4)
    }
  }

  pageFooter(doc)

  // ── PAGE 5: Summary + legal notice ────────────────────
  doc.addPage()
  doc.setFillColor(...DARK)
  doc.rect(0, 0, 210, 18, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(255, 255, 255)
  doc.text('RÉCAPITULATIF & MENTIONS LÉGALES', 105, 8, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(200, 195, 185)
  doc.text(`Dossier généré le ${generatedStr}`, 105, 14, { align: 'center' })

  let y5 = 26

  // Summary table
  y5 = sectionTitle(doc, 'RÉCAPITULATIF DU DOSSIER', y5)
  doc.autoTable({
    startY: y5,
    body: [
      ['Contrat N°', contract.contractNumber || '—'],
      ['Client', contract.clientName || '—'],
      ['Véhicule', contract.vehicleName || '—'],
      ['Date départ', contract.startDate || '—'],
      ['Date retour', contract.returnDate || contract.endDate || '—'],
      ['Photos avant', `${beforePhotos.length} photo(s) de référence`],
      ['Photos après', `${afterPhotos.length} photo(s) de retour`],
      ['Résultat IA', aiAnalysis ? (aiAnalysis.hasDamage ? 'Dommages détectés' : 'Aucun dommage') : 'Non analysé'],
      ['Horodatage', generatedStr],
    ],
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } },
    alternateRowStyles: { fillColor: LIGHT },
    margin: { left: 14, right: 14 },
    theme: 'grid',
  })
  y5 = doc.lastAutoTable.finalY + 12

  // Legal notice
  y5 = sectionTitle(doc, 'MENTIONS LÉGALES', y5)
  const legalText = [
    'Ce document a été généré automatiquement par le système RentaFlow et constitue un dossier de preuve horodaté.',
    'Les photographies incluses ont été compressées mais conservent leur valeur probatoire.',
    "L'analyse IA est fournie à titre indicatif et ne remplace pas l'expertise d'un professionnel.",
    'Ce document peut être utilisé dans le cadre de procédures amiables ou judiciaires concernant des litiges de location.',
    'Toute modification de ce document après génération annule sa valeur probatoire.',
    `Agence: ${agency.name || '—'}  |  ICE: ${agency.ice || '—'}  |  RC: ${agency.rc || '—'}`,
  ]
  legalText.forEach(line => {
    const lines = doc.splitTextToSize(`• ${line}`, 178)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...DARK)
    doc.text(lines, 16, y5)
    y5 += lines.length * 5 + 2
  })

  y5 += 10

  // Signature boxes
  if (y5 < 240) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...DARK)
    doc.text('Signature Locataire', 14, y5)
    doc.text('Signature Agence', 120, y5)
    y5 += 3
    doc.setDrawColor(...GRAY)
    doc.setLineWidth(0.4)
    doc.rect(14, y5, 80, 28)
    doc.rect(120, y5, 72, 28)
  }

  pageFooter(doc)

  doc.save(`dossier-litige-${contract.contractNumber || 'doc'}-${dateSlug}.pdf`)
}

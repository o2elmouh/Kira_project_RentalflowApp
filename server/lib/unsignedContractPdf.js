// Server-side PDF generation for the unsigned contract.
//
// Mobile clients can't run the web app's jsPDF generator (browser-only),
// so the mobile flow calls `GET /contracts/:id/unsigned-pdf` to get the
// base64 PDF, then forwards it to `/send-whatsapp` or `/send-email`.
//
// The agency's uploaded PDF template is appended later by
// `appendAgencyTemplate()` in `contractSigning.js` — this generator
// produces the *data page* with the contract identification fields.
// Keep it simple: structured, single page, monospace-friendly.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const MARGIN     = 50
const LINE       = 18
const TITLE_SIZE = 18
const LABEL_SIZE = 9
const VALUE_SIZE = 11
const HEADER_SIZE = 12

// Ink Black (#141413) — matches the web app's DESIGN.md primary CTA color.
const INK   = rgb(0.078, 0.078, 0.075)
const SLATE = rgb(0.412, 0.412, 0.412)
const RULE  = rgb(0.82, 0.80, 0.78)

function fmtDate(input) {
  if (!input) return '—'
  const d = new Date(input)
  if (isNaN(d.getTime())) return String(input)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

function fmtMoney(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '— MAD'
  return `${v.toLocaleString('fr-MA')} MAD`
}

function safe(text) {
  // pdf-lib's StandardFonts (WinAnsi) can't encode some characters. Strip the
  // ones we're likely to hit in client/vehicle names. Production agencies use
  // mostly Latin script; Arabic plates are rendered via separate fields.
  return String(text ?? '')
    .replace(/[^\x00-\xFF]/g, '?')
}

/**
 * Build the unsigned contract PDF.
 *
 * @param {object} args
 * @param {object} args.contract  — DB row from `contracts`
 * @param {object} args.client    — DB row from `clients`
 * @param {object} args.vehicle   — DB row from `vehicles`
 * @param {object} args.agency    — DB row from `agencies`
 * @returns {Promise<Uint8Array>} PDF bytes
 */
export async function buildUnsignedContractPdf({ contract, client, vehicle, agency }) {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595.28, 841.89]) // A4 portrait
  const { width, height } = page.getSize()
  const font     = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)

  let y = height - MARGIN

  const drawText = (text, x, yPos, opts = {}) => {
    page.drawText(safe(text), {
      x, y: yPos,
      size:  opts.size  ?? VALUE_SIZE,
      font:  opts.bold  ? fontBold : font,
      color: opts.color ?? INK,
    })
  }
  const drawRule = (yPos) => {
    page.drawLine({
      start: { x: MARGIN, y: yPos }, end: { x: width - MARGIN, y: yPos },
      thickness: 0.5, color: RULE,
    })
  }
  const drawRow = (label, value) => {
    drawText(label.toUpperCase(), MARGIN, y, { size: LABEL_SIZE, color: SLATE, bold: true })
    drawText(value || '—', MARGIN + 130, y, { size: VALUE_SIZE })
    y -= LINE
  }
  const sectionHeader = (title) => {
    y -= 6
    drawText(title, MARGIN, y, { size: HEADER_SIZE, bold: true })
    y -= 4
    drawRule(y)
    y -= LINE
  }

  // ── Header ─────────────────────────────────────────────────────────
  drawText(safe(agency?.name || 'Agence'), MARGIN, y, { size: TITLE_SIZE, bold: true })
  drawText(`Contrat N° ${contract?.contract_number || '—'}`, width - MARGIN - 200, y, { size: VALUE_SIZE, color: SLATE })
  y -= LINE + 4
  if (agency?.ice) { drawText(`ICE: ${agency.ice}`, MARGIN, y, { size: LABEL_SIZE, color: SLATE }); y -= LINE - 2 }
  if (agency?.rc)  { drawText(`RC: ${agency.rc}`,   MARGIN, y, { size: LABEL_SIZE, color: SLATE }); y -= LINE - 2 }
  if (agency?.address || agency?.city) {
    drawText([agency?.address, agency?.city].filter(Boolean).join(', '), MARGIN, y, { size: LABEL_SIZE, color: SLATE })
    y -= LINE - 2
  }
  if (agency?.phone) { drawText(`Tél: ${agency.phone}`, MARGIN, y, { size: LABEL_SIZE, color: SLATE }); y -= LINE - 2 }

  y -= 6
  drawRule(y)
  y -= LINE

  // ── Client ─────────────────────────────────────────────────────────
  sectionHeader('Client')
  const firstName = client?.firstName || client?.first_name || ''
  const lastName  = client?.lastName  || client?.last_name  || ''
  drawRow('Nom',         `${firstName} ${lastName}`.trim())
  drawRow('CIN / Pièce', client?.cinNumber || client?.id_number || '')
  drawRow('Date naissance', fmtDate(client?.dateOfBirth || client?.date_of_birth))
  drawRow('Téléphone',   client?.phone || '')
  drawRow('Email',       client?.email || '')
  drawRow('Adresse',     [client?.address, client?.city].filter(Boolean).join(', '))
  drawRow('Nationalité', client?.nationality || '')
  drawRow('Permis n°',   client?.drivingLicenseNumber || client?.driving_license_num || '')
  drawRow('Permis exp.', fmtDate(client?.licenseExpiry || client?.driving_license_expiry))

  // ── Vehicle ───────────────────────────────────────────────────────
  sectionHeader('Véhicule')
  drawRow('Marque',     vehicle?.brand || '')
  drawRow('Modèle',     vehicle?.model || '')
  drawRow('Année',      vehicle?.year ? String(vehicle.year) : '')
  drawRow('Plaque',     vehicle?.plate_number || vehicle?.plate || '')
  drawRow('Couleur',    vehicle?.color || '')
  drawRow('Carburant',  vehicle?.fuel_type || vehicle?.fuelType || '')
  drawRow('Boîte',      vehicle?.transmission || '')
  drawRow('Km départ',  contract?.mileage_start != null ? `${Number(contract.mileage_start).toLocaleString('fr-MA')} km` : '')
  drawRow('Carburant départ', contract?.fuel_level_start || '')

  // ── Period & money ────────────────────────────────────────────────
  sectionHeader('Période & tarif')
  drawRow('Date de départ', fmtDate(contract?.pickup_date))
  drawRow('Date de retour', fmtDate(contract?.return_date))
  drawRow('Durée',          contract?.total_days != null ? `${contract.total_days} jour(s)` : '')
  drawRow('Tarif journalier', fmtMoney(contract?.daily_rate))
  drawRow('Caution',        fmtMoney(contract?.deposit_amount))
  drawRow('Montant total',  fmtMoney(contract?.total_amount))
  drawRow('Paiement',       contract?.payment_method || '')

  // ── Signature placeholder ─────────────────────────────────────────
  y -= 20
  drawRule(y)
  y -= LINE + 8
  drawText('Signature du client', MARGIN, y, { size: HEADER_SIZE, bold: true })
  drawText('Signature de l\'agence', width / 2 + 20, y, { size: HEADER_SIZE, bold: true })
  y -= 60
  // boxes for visual placement (signing happens on the web sign page;
  // these are just guides for printed copies).
  page.drawRectangle({ x: MARGIN, y, width: (width / 2) - MARGIN - 20, height: 50, borderColor: RULE, borderWidth: 0.5 })
  page.drawRectangle({ x: width / 2 + 20, y, width: (width / 2) - MARGIN - 20, height: 50, borderColor: RULE, borderWidth: 0.5 })

  // ── Footer ────────────────────────────────────────────────────────
  drawText(
    `Généré le ${fmtDate(new Date())} — ${agency?.name || 'RentaFlow'}`,
    MARGIN, MARGIN - 10, { size: 8, color: SLATE },
  )

  return await doc.save()
}

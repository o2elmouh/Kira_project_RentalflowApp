import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { fmtDate } from '../../utils/restitutionUtils'

export default function generateRestitutionPDF({ agency = {}, contract, returnDate, returnTime, returnMileage, returnFuelLevel,
  returnPhotos, returnDamages, extraKmFee, fuelFee, damageFee, totalExtraFees, extraKm, fuelDiff }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const ACCENT = [199, 75, 31]
  const DARK   = [28, 26, 22]
  const GRAY   = [120, 116, 108]
  const LIGHT  = [245, 243, 238]

  // Header band
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

  // Client & Vehicle info
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...GRAY)
  doc.text('CLIENT', 14, y)
  doc.text('VÉHICULE', 110, y)
  y += 4
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...DARK)
  doc.text(contract.clientName || '—', 14, y)
  doc.text(contract.vehicleName || '—', 110, y)
  y += 5

  // Départ vs Retour table
  y += 4
  doc.autoTable({
    startY: y,
    head: [['', 'Départ', 'Retour']],
    body: [
      ['Date', fmtDate(contract.startDate), fmtDate(returnDate)],
      ['Heure', contract.startTime || '—', returnTime || '—'],
      ['Kilométrage', `${contract.startMileage || contract.mileageOut || '—'} km`, `${returnMileage || '—'} km`],
      ['Carburant', contract.fuelLevel || '—', returnFuelLevel || '—'],
    ],
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: ACCENT, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: LIGHT },
    margin: { left: 14, right: 14 },
    theme: 'grid',
  })
  y = doc.lastAutoTable.finalY + 8

  // Damages table — returnDamages is already pre-filtered to only checked items
  const damagedZones = returnDamages || []
  if (damagedZones.length > 0) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...GRAY)
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

  // Fees table
  const feeRows = []
  if (extraKmFee > 0) feeRows.push([`Km supplémentaires (${extraKm} km × 2 MAD)`, `${extraKmFee} MAD`])
  if (fuelFee > 0) feeRows.push([`Manque carburant (${fuelDiff} quart(s) × 100 MAD)`, `${fuelFee} MAD`])
  if (damageFee > 0) feeRows.push([`Frais dommages`, `${damageFee} MAD`])
  feeRows.push([{ content: 'TOTAL FRAIS SUPPLÉMENTAIRES', styles: { fontStyle: 'bold' } }, { content: `${totalExtraFees} MAD`, styles: { fontStyle: 'bold' } }])

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...GRAY)
  doc.text('FRAIS SUPPLÉMENTAIRES', 14, y)
  y += 3
  doc.autoTable({
    startY: y,
    body: feeRows,
    styles: { fontSize: 9, cellPadding: 3 },
    alternateRowStyles: { fillColor: LIGHT },
    margin: { left: 14, right: 14 },
    theme: 'grid',
  })
  y = doc.lastAutoTable.finalY + 12

  // Signature boxes
  if (y > 230) { doc.addPage(); y = 20 }
  doc.setDrawColor(...GRAY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...DARK)
  doc.text('Signature Locataire', 14, y)
  doc.text('Signature Agence', 120, y)
  y += 3
  doc.rect(14, y, 80, 28)
  doc.rect(120, y, 80, 28)

  doc.save(`restitution-${contract.contractNumber || 'doc'}.pdf`)
}

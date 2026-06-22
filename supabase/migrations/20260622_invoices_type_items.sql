-- Distinguish restitution (end-of-rental surplus) invoices from the base rental
-- invoice, and persist their line items + notes so the PDF can render them as a
-- separate, itemized invoice instead of re-deriving the full rental total from
-- the contract.
--
-- Background: the surplus invoice created on restitution closure
-- (pages/restitution/Step4Closure.jsx) was saved with `items` + `notes` that the
-- mapper never persisted, and the invoices table had no `type`, so the preview
-- (utils/pdf.js) fell back to contract figures and showed the full rental total.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS type  text  NOT NULL DEFAULT 'rental'
    CHECK (type IN ('rental', 'restitution')),
  ADD COLUMN IF NOT EXISTS items jsonb,
  ADD COLUMN IF NOT EXISTS notes text;

-- Backfill existing rows. Restitution invoices were created without rental
-- duration/dates (Step4Closure passes neither `days` nor start/end), whereas
-- rental invoices (pages/rental/ContractStep.jsx) always carry days > 0 + dates.
UPDATE invoices
SET type = 'restitution'
WHERE type = 'rental'
  AND (days IS NULL OR days = 0)
  AND start_date IS NULL;

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AlertCard from '../../components/AlertCard.jsx'

const baseAlert = {
  id: 'alert-1',
  source: 'whatsapp',
  sender_id: '212600000000@s.whatsapp.net',
  created_at: new Date().toISOString(),
  extracted_data: {
    summary_for_agent: 'Garage demande statut réparation Duster',
    translated_body: 'Bonjour, je voudrais savoir où en est la réparation de la Dacia Duster.',
    classification: 'alert',
  },
}

describe('AlertCard', () => {
  it('renders the summary', () => {
    render(<AlertCard alert={baseAlert} onEscalate={() => {}} onIgnore={() => {}} />)
    expect(screen.getByText('Garage demande statut réparation Duster')).toBeInTheDocument()
  })

  it('renders the source badge', () => {
    render(<AlertCard alert={baseAlert} onEscalate={() => {}} onIgnore={() => {}} />)
    expect(screen.getByText(/WhatsApp/i)).toBeInTheDocument()
  })

  it('shows Escalader and Ignorer buttons', () => {
    render(<AlertCard alert={baseAlert} onEscalate={() => {}} onIgnore={() => {}} />)
    expect(screen.getByText('Escalader')).toBeInTheDocument()
    expect(screen.getByText('Ignorer')).toBeInTheDocument()
  })

  it('calls onEscalate with alert id when Escalader is clicked', () => {
    const onEscalate = vi.fn()
    render(<AlertCard alert={baseAlert} onEscalate={onEscalate} onIgnore={() => {}} />)
    fireEvent.click(screen.getByText('Escalader'))
    expect(onEscalate).toHaveBeenCalledWith('alert-1')
  })

  it('calls onIgnore with alert id when Ignorer is clicked', () => {
    const onIgnore = vi.fn()
    render(<AlertCard alert={baseAlert} onEscalate={() => {}} onIgnore={onIgnore} />)
    fireEvent.click(screen.getByText('Ignorer'))
    expect(onIgnore).toHaveBeenCalledWith('alert-1')
  })

  it('collapsed body is hidden by default', () => {
    render(<AlertCard alert={baseAlert} onEscalate={() => {}} onIgnore={() => {}} />)
    expect(screen.queryByText('Bonjour, je voudrais savoir')).not.toBeInTheDocument()
  })

  it('expands translated body on toggle click', () => {
    render(<AlertCard alert={baseAlert} onEscalate={() => {}} onIgnore={() => {}} />)
    fireEvent.click(screen.getByText(/Voir message complet/i))
    expect(screen.getByText(/Bonjour, je voudrais savoir/)).toBeInTheDocument()
  })

  it('renders Gmail source badge for gmail alerts', () => {
    const gmailAlert = { ...baseAlert, source: 'gmail', sender_id: 'axa@insurance.com' }
    render(<AlertCard alert={gmailAlert} onEscalate={() => {}} onIgnore={() => {}} />)
    expect(screen.getByText(/Gmail/i)).toBeInTheDocument()
  })
})

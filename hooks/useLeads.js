import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api.js'

export function useLeads(activeTab, statusFilter) {
  const [leads, setLeads]     = useState([])
  const [alerts, setAlerts]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (activeTab === 'alertes') {
        const data = await api.getAlerts()
        setAlerts(data || [])
      } else {
        const data = await api.getLeads(statusFilter)
        setLeads(data || [])
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [activeTab, statusFilter])

  useEffect(() => { load() }, [load])

  async function handleStatusChange(id, status) {
    await api.updateLeadStatus(id, status)
    load()
  }

  async function handleEscalate(id) {
    await api.escalateAlert(id)
    load()
  }

  async function handleIgnoreAlert(id) {
    await api.updateLeadStatus(id, 'ignored')
    load()
  }

  return { leads, alerts, loading, error, load, handleStatusChange, handleEscalate, handleIgnoreAlert }
}

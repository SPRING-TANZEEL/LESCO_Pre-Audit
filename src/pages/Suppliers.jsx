import { useState, useEffect } from 'react'
import { db } from '../store'

const EMPTY_SUPPLIER = { name: '', ntn: '', address: '', type: 'company', default_wht_rate: 5, is_active: true }
const EMPTY_EXM = { certificate_no: '', valid_from: '', valid_to: '', wht_rate: '' }

function getCertStatus(exm) {
  const today = new Date(); today.setHours(0,0,0,0)
  const from = new Date(exm.valid_from), to = new Date(exm.valid_to)
  if (today < from) return { label: 'Future', color: 'blue' }
  if (today > to) return { label: 'Expired', color: 'gray' }
  return { label: 'Active', color: 'green' }
}

function checkOverlap(existing, newFrom, newTo, excludeId = null) {
  const f = new Date(newFrom), t = new Date(newTo)
  for (const e of existing) {
    if (excludeId && e.id === excludeId) continue
    if (f <= new Date(e.valid_to) && t >= new Date(e.valid_from)) return e
  }
  return null
}

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([])
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState(EMPTY_SUPPLIER)
  const [exemptions, setExemptions] = useState([])
  const [exmForm, setExmForm] = useState(EMPTY_EXM)
  const [showExmForm, setShowExmForm] = useState(false)
  const [overlapError, setOverlapError] = useState('')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => { loadSuppliers() }, [])

  async function loadSuppliers() {
    const data = await db.getSuppliers()
    setSuppliers(data)
  }

  async function selectSupplier(s) {
    setSelected(s); setForm({ ...s })
    const exms = await db.getExemptions(s.id)
    setExemptions(exms)
    setShowExmForm(false); setExmForm(EMPTY_EXM); setOverlapError('')
  }

  async function saveSupplier(e) {
    e.preventDefault(); setLoading(true)
    const saved = await db.saveSupplier(form)
    await loadSuppliers()
    setSelected(saved)
    setMsg('Saved'); setTimeout(() => setMsg(''), 2000)
    setLoading(false)
  }

  async function saveExemption(e) {
    e.preventDefault(); setOverlapError('')
    const overlap = checkOverlap(exemptions, exmForm.valid_from, exmForm.valid_to)
    if (overlap) { setOverlapError(`Overlaps with certificate "${overlap.certificate_no}" (${overlap.valid_from} to ${overlap.valid_to})`); return }
    await db.saveExemption({ ...exmForm, supplier_id: selected.id, wht_rate: parseFloat(exmForm.wht_rate) })
    const exms = await db.getExemptions(selected.id)
    setExemptions(exms); setExmForm(EMPTY_EXM); setShowExmForm(false)
  }

  async function deleteExm(id) {
    await db.deleteExemption(id)
    const exms = await db.getExemptions(selected.id)
    setExemptions(exms)
  }

  const today = new Date(); today.setHours(0,0,0,0)
  const activeCert = exemptions.find(e => today >= new Date(e.valid_from) && today <= new Date(e.valid_to))

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20 }}>
      <div>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Suppliers</span>
            <button className="btn btn-primary btn-sm" onClick={() => { setSelected(null); setForm(EMPTY_SUPPLIER); setExemptions([]) }}>+ Add</button>
          </div>
          {suppliers.map(s => (
            <div key={s.id} onClick={() => selectSupplier(s)}
              style={{ padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid var(--gray-100)', background: selected?.id === s.id ? 'var(--accent-light)' : 'white' }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</div>
              <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>{s.type === 'company' ? 'Company' : 'Individual'} · WHT {s.default_wht_rate}%</div>
            </div>
          ))}
          {suppliers.length === 0 && <div className="text-muted text-sm" style={{ padding: 16 }}>No suppliers yet</div>}
        </div>
      </div>
      <div>
        <div className="card mb-4">
          <div className="card-header">
            <span className="card-title">{selected ? 'Edit Supplier' : 'New Supplier'}</span>
            {msg && <span className="badge badge-green">{msg}</span>}
          </div>
          <div className="card-body">
            <form onSubmit={saveSupplier}>
              <div className="form-grid">
                <div className="field form-full"><label>Supplier Name *</label><input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
                <div className="field"><label>NTN / STRN</label><input value={form.ntn || ''} onChange={e => setForm(f => ({ ...f, ntn: e.target.value }))} /></div>
                <div className="field">
                  <label>Supplier Type *</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value, default_wht_rate: e.target.value === 'company' ? 5 : 5.5 }))}>
                    <option value="company">Company (5%)</option>
                    <option value="individual">Individual (5.5%)</option>
                  </select>
                </div>
                <div className="field">
                  <label>Default WHT Rate (%)</label>
                  <input type="number" step="0.01" value={form.default_wht_rate} onChange={e => setForm(f => ({ ...f, default_wht_rate: parseFloat(e.target.value) }))} onWheel={e => e.target.blur()} />
                </div>
                <div className="field form-full"><label>Address</label><input value={form.address || ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
              </div>
              <div className="mt-4"><button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Saving...' : 'Save Supplier'}</button></div>
            </form>
          </div>
        </div>
        {selected && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">WHT Exemption Certificates</span>
              <button className="btn btn-secondary btn-sm" onClick={() => { setShowExmForm(true); setOverlapError('') }}>+ Add Certificate</button>
            </div>
            <div className="card-body">
              <div className={`alert ${activeCert ? 'alert-success' : 'alert-info'}`} style={{ marginBottom: 16 }}>
                <strong>Today's WHT Rate: {activeCert ? activeCert.wht_rate : selected.default_wht_rate}%</strong>
                {activeCert ? ` — Cert ${activeCert.certificate_no} active (till ${activeCert.valid_to})` : ` — No active cert. Default rate applies.`}
              </div>
              {overlapError && <div className="alert alert-warning">{overlapError}</div>}
              {exemptions.length > 0 && (
                <div className="table-wrap" style={{ marginBottom: 16 }}>
                  <table>
                    <thead><tr><th>#</th><th>Certificate No</th><th>Valid From</th><th>Valid To</th><th className="text-right">WHT Rate</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                      {exemptions.map((e, i) => {
                        const status = getCertStatus(e)
                        return (
                          <tr key={e.id}>
                            <td>{i + 1}</td><td><strong>{e.certificate_no}</strong></td>
                            <td>{e.valid_from}</td><td>{e.valid_to}</td>
                            <td className="text-right"><strong>{e.wht_rate}%</strong></td>
                            <td><span className={`badge badge-${status.color}`}>{status.label}</span></td>
                            <td><button className="btn btn-danger btn-sm" onClick={() => deleteExm(e.id)}>Remove</button></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {exemptions.length === 0 && !showExmForm && <div className="text-muted text-sm">No certificates. Default rate applies.</div>}
              {showExmForm && (
                <form onSubmit={saveExemption} style={{ background: 'var(--gray-50)', padding: 16, borderRadius: 8, border: '1px solid var(--gray-200)' }}>
                  <div className="section-title" style={{ marginTop: 0 }}>New Certificate</div>
                  <div className="form-grid">
                    <div className="field"><label>Certificate No *</label><input required value={exmForm.certificate_no} onChange={e => setExmForm(f => ({ ...f, certificate_no: e.target.value }))} /></div>
                    <div className="field"><label>WHT Rate (%) *</label><input type="number" step="0.01" required value={exmForm.wht_rate} onChange={e => setExmForm(f => ({ ...f, wht_rate: e.target.value }))} onWheel={e => e.target.blur()} /></div>
                    <div className="field"><label>Valid From *</label><input type="date" required value={exmForm.valid_from} onChange={e => setExmForm(f => ({ ...f, valid_from: e.target.value }))} /></div>
                    <div className="field"><label>Valid To *</label><input type="date" required value={exmForm.valid_to} onChange={e => setExmForm(f => ({ ...f, valid_to: e.target.value }))} /></div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button type="submit" className="btn btn-primary btn-sm">Save</button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setShowExmForm(false); setOverlapError('') }}>Cancel</button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

import { useState, useEffect, useRef } from 'react'
import { db } from '../store'
import { fmtPKR } from '../utils/calculations'

const BUDGET_HEADS = ['Consumer Finance', 'ELR', 'DOP', 'R&M', 'Repair (Reclamation Transformers)']

const EMPTY_PO = {
  po_number: '', po_date: '', supplier_id: '', gst_rate: 18,
  total_amount_ex_gst: 0, gst_amount: 0, grand_total: 0,
  ld_rate: 2, ld_max_cap_pct: 10,
  pg_amount: 0, pg_validity_to: '', pg_bank_guarantee_no: '',
  warranty_months: 24, budget_heads: [], tender_no: '', notes: '',
  prototype_required: false, payment_method: 'cheque', lc_application_date: '',
}
const EMPTY_SCHED = { shipment_no: 1, po_item_id: '', promised_qty: '', promised_date: '' }
const EMPTY_ITEM = { id: null, product_id: '', product_name: '', unit_rate: '', total_qty: '', unit_of_measure: 'Each' }

// ── Supplier Search ──────────────────────────────────────────
function SupplierSearch({ suppliers, value, onChange }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef()
  const selected = suppliers.find(s => s.id === value)
  const filtered = query.trim() ? suppliers.filter(s => s.name.toLowerCase().includes(query.toLowerCase())) : suppliers
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {selected && !open ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid var(--gray-300)', borderRadius: 6, background: 'white' }}>
          <span style={{ flex: 1, fontSize: 13 }}>{selected.name}</span>
          <button type="button" onClick={() => { onChange(''); setOpen(true) }} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>
      ) : (
        <input value={query} placeholder="Type to search supplier..." onChange={e => { setQuery(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
          style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--gray-300)', borderRadius: 6, fontSize: 13 }} />
      )}
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid var(--gray-300)', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 100, maxHeight: 220, overflowY: 'auto', marginTop: 2 }}>
          {filtered.length === 0 && <div style={{ padding: '10px 12px', color: 'var(--gray-500)', fontSize: 13 }}>No suppliers found</div>}
          {filtered.map(s => (
            <div key={s.id} onMouseDown={() => { onChange(s.id); setQuery(''); setOpen(false) }}
              style={{ padding: '9px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--gray-100)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-light)'}
              onMouseLeave={e => e.currentTarget.style.background = 'white'}>
              <div style={{ fontWeight: 600 }}>{s.name}</div>
              <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>{s.type === 'company' ? 'Company' : 'Individual'} · WHT {s.default_wht_rate}%</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Product Search ───────────────────────────────────────────
function ProductSearch({ value, onSelect }) {
  const [query, setQuery] = useState(value || '')
  const [open, setOpen] = useState(false)
  const [products, setProducts] = useState([])
  const ref = useRef()
  useEffect(() => { db.getProducts().then(setProducts) }, [])
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  useEffect(() => { if (value) setQuery(value) }, [value])
  const filtered = query.trim() ? products.filter(p => p.name.toLowerCase().includes(query.toLowerCase())) : products
  const exactMatch = products.find(p => p.name.toLowerCase() === query.toLowerCase())
  async function addNew() {
    if (!query.trim()) return
    const p = await db.saveProduct({ name: query.trim(), default_uom: 'Each' })
    const updated = await db.getProducts()
    setProducts(updated)
    onSelect(p.id, p.name, p.default_uom)
    setOpen(false)
  }
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input required value={query} placeholder="Search or type new product name..."
        onChange={e => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onSelect('', '', '') }}
        onFocus={() => setOpen(true)}
        style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--gray-300)', borderRadius: 6, fontSize: 13 }} />
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid var(--gray-300)', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 100, maxHeight: 240, overflowY: 'auto', marginTop: 2 }}>
          {filtered.map(p => (
            <div key={p.id} onMouseDown={() => { onSelect(p.id, p.name, p.default_uom); setQuery(p.name); setOpen(false) }}
              style={{ padding: '9px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--gray-100)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-light)'}
              onMouseLeave={e => e.currentTarget.style.background = 'white'}>
              {p.name} <span style={{ fontSize: 11, color: 'var(--gray-500)' }}>({p.default_uom})</span>
            </div>
          ))}
          {query.trim() && !exactMatch && (
            <div onMouseDown={addNew} style={{ padding: '9px 12px', cursor: 'pointer', fontSize: 13, color: 'var(--accent)', fontWeight: 600, borderTop: '1px solid var(--gray-200)', background: 'var(--accent-light)' }}>
              + Add new: "{query.trim()}"
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Budget Head Selector ─────────────────────────────────────
function BudgetHeadSelector({ value, onChange }) {
  const selected = value || []
  function toggle(head) { onChange(selected.find(s => s.head === head) ? selected.filter(s => s.head !== head) : [...selected, { head, pct: '' }]) }
  function setPct(head, pct) { onChange(selected.map(s => s.head === head ? { ...s, pct: pct === '' ? '' : parseFloat(pct) || 0 } : s)) }
  const total = selected.reduce((sum, s) => sum + (parseFloat(s.pct) || 0), 0)
  const statement = selected.filter(s => s.pct > 0).map(s => `${s.head} ${s.pct}%`).join(', ')
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {BUDGET_HEADS.map(head => {
          const isSel = !!selected.find(s => s.head === head)
          return (
            <button key={head} type="button" onClick={() => toggle(head)}
              style={{ padding: '5px 12px', borderRadius: 99, fontSize: 12, cursor: 'pointer', border: '1px solid', borderColor: isSel ? 'var(--accent)' : 'var(--gray-300)', background: isSel ? 'var(--accent-light)' : 'white', color: isSel ? 'var(--accent)' : 'var(--gray-700)', fontWeight: isSel ? 600 : 400 }}>
              {isSel ? '✓ ' : ''}{head}
            </button>
          )
        })}
      </div>
      {selected.length > 0 && (
        <div style={{ background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 8, padding: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
            {selected.map(s => (
              <div key={s.head} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, flex: 1 }}>{s.head}</span>
                <input type="number" min="0" max="100" step="0.01" value={s.pct} onChange={e => setPct(s.head, e.target.value)}
                  onWheel={e => e.target.blur()} placeholder="%" style={{ width: 64, padding: '4px 6px', border: '1px solid var(--gray-300)', borderRadius: 4, fontSize: 12, textAlign: 'right' }} />
                <span style={{ fontSize: 12 }}>%</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: total > 100 ? 'var(--red)' : total === 100 ? 'var(--green)' : 'var(--gray-500)', fontWeight: 600 }}>
            Total: {total}% {total > 100 ? '⚠️ Exceeds 100%' : total === 100 ? '✓' : ''}
          </div>
          {statement && <div style={{ marginTop: 8, padding: '7px 10px', background: 'white', border: '1px solid var(--gray-200)', borderRadius: 6, fontSize: 12, fontStyle: 'italic' }}>{statement}</div>}
        </div>
      )}
    </div>
  )
}

// ── PG Modal ─────────────────────────────────────────────────
function PGModal({ po, onClose, onSaved }) {
  const [newValidTo, setNewValidTo] = useState('')
  const [newBGNo, setNewBGNo] = useState(po?.pg_bank_guarantee_no || '')
  async function savePG(e) {
    e.preventDefault()
    await db.savePO({ ...po, id: po.id, pg_validity_to: newValidTo, pg_bank_guarantee_no: newBGNo })
    onSaved()
  }
  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <span className="modal-title">Update PG Validity — {po?.po_number}</span>
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>
        <form onSubmit={savePG}>
          <div className="modal-body">
            <div className="alert alert-info" style={{ marginBottom: 16 }}>Current: till <strong>{po?.pg_validity_to || 'not set'}</strong></div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>New Valid Till *</label>
              <input type="date" required value={newValidTo} onChange={e => setNewValidTo(e.target.value)} />
            </div>
            <div className="field"><label>Bank Guarantee No</label><input value={newBGNo} onChange={e => setNewBGNo(e.target.value)} /></div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Update</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────
export default function PurchaseOrders({ navigate, role }) {
  const [pos, setPOs] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_PO })
  const [poItems, setPOItems] = useState([{ ...EMPTY_ITEM }])
  const [schedules, setSchedules] = useState([{ ...EMPTY_SCHED }])
  const [editing, setEditing] = useState(null)
  const [msg, setMsg] = useState('')
  const [pgModalPO, setPgModalPO] = useState(null)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [p, s] = await Promise.all([db.getPOs(), db.getSuppliers()])
    setPOs(p); setSuppliers(s); setLoading(false)
  }

  function f(field, val) { setForm(p => ({ ...p, [field]: val })) }

  function recalcGST(exGst, gstRate) {
    const g = Math.round((parseFloat(exGst) || 0) * (parseFloat(gstRate) || 0) / 100)
    setForm(p => ({ ...p, gst_amount: g, grand_total: (parseFloat(exGst) || 0) + g }))
  }

  function recalcFromItems(items, gstRate) {
    const exGst = items.reduce((s, i) => s + (parseFloat(i.unit_rate) || 0) * (parseInt(i.total_qty) || 0), 0)
    const gst = Math.round(exGst * (parseFloat(gstRate) || 0) / 100)
    setForm(p => ({ ...p, total_amount_ex_gst: exGst, gst_amount: gst, grand_total: exGst + gst }))
  }

  function addItem() { setPOItems(i => [...i, { ...EMPTY_ITEM }]) }
  function removeItem(idx) { const u = poItems.filter((_, i) => i !== idx); setPOItems(u); recalcFromItems(u, form.gst_rate) }
  function updateItem(idx, field, val) {
    const u = poItems.map((row, i) => i === idx ? { ...row, [field]: val } : row)
    setPOItems(u)
    if (field === 'unit_rate' || field === 'total_qty') recalcFromItems(u, form.gst_rate)
  }
  function setItemProduct(idx, productId, productName, defaultUOM) {
    setPOItems(p => p.map((row, i) => i === idx ? { ...row, product_id: productId, product_name: productName, unit_of_measure: defaultUOM || row.unit_of_measure } : row))
  }

  function addSched() { setSchedules(s => [...s, { ...EMPTY_SCHED, shipment_no: s.length + 1 }]) }
  function removeSched(idx) { setSchedules(s => s.filter((_, i) => i !== idx)) }
  function updateSched(idx, field, val) { setSchedules(s => s.map((row, i) => i === idx ? { ...row, [field]: val } : row)) }

  async function openNew() {
    setEditing(null); setForm({ ...EMPTY_PO }); setPOItems([{ ...EMPTY_ITEM }]); setSchedules([{ ...EMPTY_SCHED }]); setShowForm(true)
  }

  async function openEdit(po) {
    setEditing(po.id)
    setForm({ ...po, budget_heads: po.budget_heads || [] })
    const [items, scheds] = await Promise.all([db.getPOItems(po.id), db.getSchedules(po.id)])
    setPOItems(items.length ? items.map(i => ({ ...i })) : [{ ...EMPTY_ITEM }])
    setSchedules(scheds.length ? scheds : [{ ...EMPTY_SCHED }])
    setShowForm(true)
  }

  function lcCheck() {
    if (!form.po_date || !form.lc_application_date) return null
    const diff = Math.floor((new Date(form.lc_application_date) - new Date(form.po_date)) / 864e5)
    if (diff < 0) return { ok: false, msg: '⚠️ LC application date is before PO date' }
    if (diff <= 7) return { ok: true, msg: `✅ Received within 7 days of PO (Day ${diff})` }
    return { ok: false, msg: `⚠️ Received ${diff} days after PO — beyond 7-day requirement` }
  }

  async function save(e) {
    e.preventDefault()
    const heads = form.budget_heads || []
    if (heads.reduce((s, h) => s + (parseFloat(h.pct) || 0), 0) > 100) { alert('Budget percentages exceed 100%'); return }
    if (poItems.some(i => !i.product_name)) { alert('All items must have a product name'); return }
    setSaving(true)
    try {
      const data = { ...form, status: editing ? form.status : 'pending_approval' }
      if (!editing) delete data.id
            const saved = await db.savePO(editing ? { ...data, id: editing } : data)
      if (!saved) { alert('Error: PO could not be saved. Check if PO number already exists.'); setSaving(false); return }

      // Save products to master
             const savedItems = []
      for (const item of poItems) {
        let prod = null
        if (item.product_id) {
          prod = { id: item.product_id }
        } else if (item.product_name) {
          prod = await db.findProduct(item.product_name)
          if (!prod) prod = await db.saveProduct({ name: item.product_name, default_uom: item.unit_of_measure || 'Each' })
        }
        savedItems.push({
          po_id: saved.id,
          product_id: prod?.id || null,
          product_name: item.product_name || '',
          description: item.product_name || '',
          unit_rate: parseFloat(item.unit_rate) || 0,
          total_qty: parseInt(item.total_qty) || 0,
          unit_of_measure: item.unit_of_measure || 'Each',
        })
      }
        let prod = null
        if (item.product_id) {
          prod = { id: item.product_id }
        } else if (item.product_name) {
          prod = await db.findProduct(item.product_name)
          if (!prod) prod = await db.saveProduct({ name: item.product_name, default_uom: item.unit_of_measure || 'Each' })
        }
                const row = {
          po_id: saved.id,
          product_id: prod?.id || null,
          product_name: item.product_name || '',
          description: item.product_name || '',
          unit_rate: parseFloat(item.unit_rate) || 0,
          total_qty: parseInt(item.total_qty) || 0,
          unit_of_measure: item.unit_of_measure || 'Each',
        }
        return row
            if (savedItems.some(i => !i.product_name)) { alert('Error: Product name missing on one or more items'); setSaving(false); return }
            const itemsResult = await db.replacePOItems(saved.id, savedItems)
      console.log('Items saved:', itemsResult)
      const savedItemsFromDB = await db.getPOItems(saved.id)
      console.log('Items from DB:', savedItemsFromDB)
      await db.replaceSchedules(saved.id, schedules.map((s, i) => ({
        ...s, shipment_no: i + 1, promised_qty: parseInt(s.promised_qty) || 0,
                po_item_id: savedItemsFromDB.length === 1 ? savedItemsFromDB[0]?.id : (savedItemsFromDB.find(si => si.product_name === poItems[i]?.product_name)?.id || null)
      })))
      await load()
      setShowForm(false)
      setMsg('PO saved successfully')
      setTimeout(() => setMsg(''), 3000)
    } catch (err) {
      alert('Error saving PO: ' + err.message)
    }
    setSaving(false)
  }

  const lcResult = lcCheck()

  const filteredPOs = pos.filter(po => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    const s = suppliers.find(s => s.id === po.supplier_id)
    return po.po_number?.toLowerCase().includes(q) || s?.name?.toLowerCase().includes(q)
  })

  if (loading) return <div className="text-muted" style={{ padding: 32 }}>Loading...</div>

  // ── LIST ──────────────────────────────────────────────────
  if (!showForm) return (
    <>
      {pgModalPO && <PGModal po={pgModalPO} onClose={() => setPgModalPO(null)} onSaved={async () => { await load(); setPgModalPO(null) }} />}
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-2 items-center">
          {msg && <span className="badge badge-green">{msg}</span>}
          <input type="text" placeholder="🔍 Search by PO No or supplier..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ padding: '7px 12px', border: '1px solid var(--gray-300)', borderRadius: 6, fontSize: 13, width: 320 }} />
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ New Purchase Order</button>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>PO No</th><th>Date</th><th>Supplier</th><th className="text-right">Grand Total</th><th>Payment</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filteredPOs.length === 0 && <tr><td colSpan={7} className="text-center text-muted" style={{ padding: 32 }}>No purchase orders found.</td></tr>}
              {filteredPOs.map(po => {
                const s = suppliers.find(s => s.id === po.supplier_id)
                return (
                  <tr key={po.id}>
                    <td><strong>{po.po_number}</strong></td>
                    <td>{po.po_date}</td>
                    <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s?.name}</td>
                    <td className="text-right font-mono"><strong>{fmtPKR(po.grand_total)}</strong></td>
                    <td><span className={`badge badge-${po.payment_method === 'lc' ? 'blue' : 'gray'}`}>{po.payment_method === 'lc' ? 'LC' : 'Cheque'}</span></td>
                    <td><span className={`badge badge-${po.status === 'active' ? 'green' : 'amber'}`}>{po.status === 'active' ? 'Approved' : 'Pending'}</span></td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn btn-secondary btn-sm" onClick={() => navigate('po-detail', { poId: po.id })}>View</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(po)}>Edit</button>
                        {po.status === 'pending_approval' && role === 'accounts_officer' && (
                          <button className="btn btn-success btn-sm" onClick={async () => { await db.savePO({ ...po, id: po.id, status: 'active' }); await load() }}>✓ Approve</button>
                        )}
                        <button className="btn btn-secondary btn-sm" onClick={() => setPgModalPO(po)}>PG</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )

  // ── FORM ──────────────────────────────────────────────────
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">{editing ? `Edit PO — ${form.po_number}` : 'New Purchase Order'}</span>
        <button className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}>← Back</button>
      </div>
      <div className="card-body">
        <form onSubmit={save}>
          <div className="section-title">Basic Information</div>
          <div className="form-grid">
            <div className="field"><label>PO Number *</label><input required value={form.po_number} onChange={e => f('po_number', e.target.value)} placeholder="e.g. 4314-P1" /></div>
            <div className="field"><label>PO Date *</label><input type="date" required value={form.po_date} onChange={e => f('po_date', e.target.value)} /></div>
            <div className="field"><label>Tender No</label><input value={form.tender_no} onChange={e => f('tender_no', e.target.value)} /></div>
            <div className="field"><label>Supplier *</label><SupplierSearch suppliers={suppliers} value={form.supplier_id} onChange={v => f('supplier_id', v)} /></div>
            <div className="field">
              <label>Prototype Required?</label>
              <select value={form.prototype_required ? 'yes' : 'no'} onChange={e => f('prototype_required', e.target.value === 'yes')}>
                <option value="no">No</option><option value="yes">Yes</option>
              </select>
            </div>
          </div>

          <div className="section-title">Budget / Functional Head</div>
          <BudgetHeadSelector value={form.budget_heads} onChange={v => f('budget_heads', v)} />

          <div className="section-title">Items / Materials</div>
          {poItems.map((item, i) => (
            <div key={i} className="grn-block" style={{ marginBottom: 10 }}>
              <div className="grn-block-header">
                <span className="grn-block-title">Item #{i + 1}</span>
                {poItems.length > 1 && <button type="button" className="btn btn-danger btn-sm" onClick={() => removeItem(i)}>Remove</button>}
              </div>
              <div className="form-grid">
                <div className="field" style={{ gridColumn: 'span 2' }}>
                  <label>Product Name *</label>
                  <ProductSearch value={item.product_name} onSelect={(id, name, uom) => setItemProduct(i, id, name, uom)} />
                  <span className="hint">Search existing or type new to add to master list</span>
                </div>
                <div className="field">
                  <label>Unit of Measure</label>
                  <select value={item.unit_of_measure} onChange={e => updateItem(i, 'unit_of_measure', e.target.value)}>
                    <option>Each</option><option>Nos</option><option>Kg</option><option>Meter</option><option>Km</option><option>Set</option><option>Lot</option>
                  </select>
                </div>
                <div className="field">
                  <label>Unit Rate (Ex-GST) *</label>
                  <input type="number" step="0.01" required value={item.unit_rate} onChange={e => updateItem(i, 'unit_rate', e.target.value)} onWheel={e => e.target.blur()} placeholder="0.00" />
                </div>
                <div className="field">
                  <label>Total Quantity *</label>
                  <input type="number" required value={item.total_qty} onChange={e => updateItem(i, 'total_qty', e.target.value)} onWheel={e => e.target.blur()} placeholder="0" />
                </div>
                <div className="field">
                  <label>Item Amount (Ex-GST)</label>
                  <input readOnly value={((parseFloat(item.unit_rate)||0)*(parseInt(item.total_qty)||0)).toLocaleString('en-PK',{minimumFractionDigits:2})} style={{ background: 'var(--gray-50)' }} />
                </div>
              </div>
            </div>
          ))}
          <button type="button" className="btn btn-secondary btn-sm" onClick={addItem} style={{ marginBottom: 16 }}>+ Add Item</button>

          <div className="form-grid">
            <div className="field"><label>Total Amount (Ex-GST)</label><input readOnly value={(form.total_amount_ex_gst||0).toLocaleString('en-PK',{minimumFractionDigits:2})} style={{ background: 'var(--gray-50)' }} /></div>
            <div className="field">
              <label>GST Rate (%)</label>
              <input type="number" step="0.01" value={form.gst_rate} onWheel={e => e.target.blur()} onChange={e => { f('gst_rate', e.target.value); recalcGST(form.total_amount_ex_gst, e.target.value) }} placeholder="18" />
            </div>
            <div className="field"><label>GST Amount (Auto)</label><input readOnly value={(form.gst_amount||0).toLocaleString('en-PK',{minimumFractionDigits:2})} style={{ background: 'var(--gray-50)' }} /></div>
            <div className="field"><label>Grand Total (incl. GST)</label><input readOnly value={(form.grand_total||0).toLocaleString('en-PK',{minimumFractionDigits:2})} style={{ background: 'var(--gray-50)', fontWeight: 700 }} /></div>
          </div>

          <div className="section-title">Payment Method</div>
          <div className="form-grid">
            <div className="field">
              <label>Payment Method *</label>
              <select value={form.payment_method} onChange={e => f('payment_method', e.target.value)}>
                <option value="cheque">Cheque</option><option value="lc">Letter of Credit (LC)</option>
              </select>
            </div>
            {form.payment_method === 'lc' && (
              <>
                <div className="field">
                  <label>LC Application Received Date</label>
                  <input type="date" value={form.lc_application_date} onChange={e => f('lc_application_date', e.target.value)} />
                </div>
                {lcResult && (
                  <div className="field" style={{ gridColumn: 'span 2' }}>
                    <div className={`alert ${lcResult.ok ? 'alert-success' : 'alert-warning'}`} style={{ margin: 0 }}>{lcResult.msg}</div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="section-title">Performance Guarantee</div>
          <div className="form-grid">
            <div className="field"><label>PG Amount (Rs.)</label><input type="number" step="0.01" value={form.pg_amount} onWheel={e => e.target.blur()} onChange={e => f('pg_amount', e.target.value)} placeholder="0.00" /></div>
            <div className="field"><label>Bank Guarantee No</label><input value={form.pg_bank_guarantee_no} onChange={e => f('pg_bank_guarantee_no', e.target.value)} /></div>
            <div className="field"><label>PG Valid Till *</label><input type="date" value={form.pg_validity_to} onChange={e => f('pg_validity_to', e.target.value)} /><span className="hint">Can be extended later via PG button</span></div>
            <div className="field"><label>Warranty (months)</label><input type="number" value={form.warranty_months} onWheel={e => e.target.blur()} onChange={e => f('warranty_months', e.target.value)} /></div>
          </div>

          <div className="section-title">LD Conditions</div>
          <div className="form-grid">
            <div className="field"><label>LD Rate (% per month)</label><input type="number" step="0.01" value={form.ld_rate} onWheel={e => e.target.blur()} onChange={e => f('ld_rate', e.target.value)} /><span className="hint">Fraction of month = full month</span></div>
            <div className="field"><label>Max LD Cap (% of Grand Total)</label><input type="number" step="0.01" value={form.ld_max_cap_pct} onWheel={e => e.target.blur()} onChange={e => f('ld_max_cap_pct', e.target.value)} /></div>
          </div>

          <div className="section-title">Delivery Schedule</div>
          {schedules.map((sch, i) => (
            <div key={i} className="grn-block">
              <div className="grn-block-header">
                <span className="grn-block-title">Shipment #{i + 1}</span>
                {schedules.length > 1 && <button type="button" className="btn btn-danger btn-sm" onClick={() => removeSched(i)}>Remove</button>}
              </div>
              <div className="form-grid">
                <div className="field">
                  <label>Product</label>
                  {poItems.length === 1 ? (
                    <input readOnly value={poItems[0].product_name || '—'} style={{ background: 'var(--gray-50)' }} />
                  ) : (
                    <select value={sch.po_item_id} onChange={e => updateSched(i, 'po_item_id', e.target.value)}>
                      <option value="">Select product...</option>
                      {poItems.filter(p => p.product_name).map((p, pi) => <option key={pi} value={p.id || pi}>{p.product_name}</option>)}
                    </select>
                  )}
                </div>
                <div className="field"><label>Quantity</label><input type="number" value={sch.promised_qty} onWheel={e => e.target.blur()} onChange={e => updateSched(i, 'promised_qty', e.target.value)} /></div>
                <div className="field"><label>Promised Delivery Date *</label><input type="date" value={sch.promised_date} onChange={e => updateSched(i, 'promised_date', e.target.value)} /></div>
              </div>
            </div>
          ))}
          <button type="button" className="btn btn-secondary btn-sm" onClick={addSched} style={{ marginBottom: 16 }}>+ Add Shipment</button>

          <div className="section-title">Notes</div>
          <div className="field">
            <textarea rows={3} value={form.notes} onChange={e => f('notes', e.target.value)} style={{ resize: 'vertical', width: '100%', padding: '8px 10px', border: '1px solid var(--gray-300)', borderRadius: 6, fontSize: 13 }} />
          </div>

          <div className="alert alert-warning mt-4">⚠️ Once saved, PO will be locked pending Accounts Officer approval. Only PG validity can be updated by assistant.</div>

          <div className="flex gap-2 mt-4">
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Purchase Order'}</button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

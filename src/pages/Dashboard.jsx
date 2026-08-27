import { useState, useEffect } from 'react'
import { db } from '../store'
import { fmtPKR } from '../utils/calculations'

export default function Dashboard({ navigate }) {
  const [pos, setPOs] = useState([])
  const [bills, setBills] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [p, b, s] = await Promise.all([db.getPOs(), db.getAllBills(), db.getSuppliers()])
      setPOs(p); setBills(b); setSuppliers(s); setLoading(false)
    }
    load()
  }, [])

  const activePOs = pos.filter(p => p.status === 'active').length
  const totalPOValue = pos.reduce((s, p) => s + (p.grand_total || 0), 0)

  if (loading) return <div className="text-muted" style={{ padding: 32 }}>Loading...</div>

  return (
    <div>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-label">Active POs</div><div className="stat-value">{activePOs}</div><div className="stat-sub">{pos.length} total</div></div>
        <div className="stat-card"><div className="stat-label">Total PO Value</div><div className="stat-value" style={{ fontSize: 16 }}>Rs. {fmtPKR(totalPOValue)}</div><div className="stat-sub">Including GST</div></div>
        <div className="stat-card"><div className="stat-label">Supply Bills</div><div className="stat-value">{bills.length}</div><div className="stat-sub">{bills.filter(b=>b.status==='pending').length} pending</div></div>
        <div className="stat-card"><div className="stat-label">Suppliers</div><div className="stat-value">{suppliers.length}</div></div>
      </div>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Recent Purchase Orders</span>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('pos')}>View All</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>PO Number</th><th>Date</th><th>Supplier</th><th className="text-right">Grand Total</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {pos.length === 0 && <tr><td colSpan={6} className="text-center text-muted" style={{ padding: 32 }}>No purchase orders yet.</td></tr>}
              {pos.slice(0,10).map(po => (
                <tr key={po.id}>
                  <td><strong>{po.po_number}</strong></td>
                  <td>{po.po_date}</td>
                  <td>{suppliers.find(s=>s.id===po.supplier_id)?.name || '—'}</td>
                  <td className="text-right font-mono">Rs. {fmtPKR(po.grand_total)}</td>
                  <td><span className={`badge badge-${po.status==='active'?'green':'amber'}`}>{po.status==='active'?'Approved':'Pending'}</span></td>
                  <td><button className="btn btn-secondary btn-sm" onClick={() => navigate('po-detail', { poId: po.id })}>View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

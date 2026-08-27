import { useState } from 'react'
import './index.css'
import Dashboard from './pages/Dashboard'
import Suppliers from './pages/Suppliers'
import PurchaseOrders from './pages/PurchaseOrders'
import PODetail from './pages/PODetail'
import SupplyBills from './pages/SupplyBills'
import GSTBills from './pages/GSTBills'
import PreAuditPrint from './pages/PreAuditPrint'
import TestData from './pages/TestData'

const NAV = [
  { section: 'Overview' },
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { section: 'Master Data' },
  { id: 'suppliers', label: 'Suppliers & WHT', icon: '🏢' },
  { id: 'pos', label: 'Purchase Orders', icon: '📋' },
  { section: 'Transactions' },
  { id: 'supply-bills', label: 'Supply Bills', icon: '🧾' },
  { id: 'gst-bills', label: 'GST Bills', icon: '📑' },
  { section: 'Reports' },
  { id: 'print', label: 'Pre-Audit Sheet', icon: '🖨️' },
  { section: 'Developer' },
  { id: 'test-data', label: 'Load Test Data', icon: '🧪' },
]

export default function App() {
    const [page, setPage] = useState('dashboard')
  const [context, setContext] = useState({})
  const [role, setRole] = useState('assistant')

  function navigate(id, ctx = {}) { setPage(id); setContext(ctx) }

  function renderPage() {
    switch (page) {
      case 'dashboard': return <Dashboard navigate={navigate} />
      case 'suppliers': return <Suppliers />
      case 'pos': return <PurchaseOrders navigate={navigate} role={role} />
      case 'po-detail': return <PODetail poId={context.poId} navigate={navigate} />
      case 'supply-bills': return <SupplyBills navigate={navigate} />
      case 'gst-bills': return <GSTBills navigate={navigate} />
      case 'print': return <PreAuditPrint billId={context.billId} navigate={navigate} />
      case 'test-data': return <TestData navigate={navigate} />
      default: return <Dashboard navigate={navigate} />
    }
  }

  const pageTitle = {
    dashboard: 'Dashboard', suppliers: 'Suppliers & WHT Setup',
    pos: 'Purchase Orders', 'po-detail': 'Purchase Order Detail',
    'supply-bills': 'Supply Bills', 'gst-bills': 'GST Bills',
    print: 'Pre-Audit Sheet',
  }[page] || 'Pre-Audit System'

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>LESCO Pre-Audit</h1>
          <p>Material Management</p>
        </div>
        <nav className="sidebar-nav">
          {NAV.map((item, i) => {
            if (item.section) return <div key={i} className="nav-section">{item.section}</div>
            const active = page === item.id || (item.id === 'pos' && page === 'po-detail')
            return (
              <button key={item.id} className={`nav-item ${active ? 'active' : ''}`} onClick={() => navigate(item.id)}>
                <span>{item.icon}</span>{item.label}
              </button>
            )
          })}
        </nav>
        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
          v2.0 · LESCO Division
        </div>
      </aside>
      <main className="main-content">
        <div className="topbar">
          <span className="topbar-title">{pageTitle}</span>
                    <div className="flex gap-2 items-center">
            <select value={role} onChange={e => setRole(e.target.value)}
              style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--gray-300)', fontSize: 12, background: role === 'accounts_officer' ? 'var(--accent-light)' : 'var(--gray-100)' }}>
              <option value="assistant">Accounts Assistant</option>
              <option value="accounts_officer">Accounts Officer</option>
            </select>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: role === 'accounts_officer' ? 'var(--green)' : 'var(--accent)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600 }}>
              {role === 'accounts_officer' ? 'AO' : 'AA'}
            </div>
          </div>
        </div>
        <div className="page-content">{renderPage()}</div>
      </main>
    </div>
  )
}

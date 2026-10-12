import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AuthGuard from './components/AuthGuard'
import Layout from './components/Layout'
import BudgetTracker from './pages/BudgetTracker'
import Dashboard from './pages/Dashboard'
import DeliveryMetrics from './pages/DeliveryMetrics'
import ReleaseRegister from './pages/ReleaseRegister'

export default function App() {
  return (
    <BrowserRouter>
      <AuthGuard>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/delivery" element={<DeliveryMetrics />} />
            <Route path="/budget" element={<BudgetTracker />} />
            <Route path="/releases" element={<ReleaseRegister />} />
          </Route>
        </Routes>
      </AuthGuard>
    </BrowserRouter>
  )
}

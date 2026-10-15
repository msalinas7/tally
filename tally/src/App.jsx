import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AuthGuard from './components/AuthGuard'
import Layout from './components/Layout'
import BudgetTracker from './pages/BudgetTracker'
import Dashboard from './pages/Dashboard'
import DeliveryMetrics from './pages/DeliveryMetrics'
import EpicsManager from './pages/EpicsManager'
import MilestoneRegister from './pages/MilestoneRegister'
import ReleaseRegister from './pages/ReleaseRegister'
import ReleaseStatus from './pages/ReleaseStatus'

export default function App() {
  return (
    <BrowserRouter>
      <AuthGuard>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/release-status" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/release-status" element={<ReleaseStatus />} />
            <Route path="/delivery" element={<DeliveryMetrics />} />
            <Route path="/budget" element={<BudgetTracker />} />
            <Route path="/releases" element={<ReleaseRegister />} />
            <Route path="/milestones" element={<MilestoneRegister />} />
            <Route path="/epics" element={<EpicsManager />} />
          </Route>
        </Routes>
      </AuthGuard>
    </BrowserRouter>
  )
}

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import Shell from './components/layout/Shell';
import ErrorBoundary from './components/ErrorBoundary';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import LoadingSkeleton from './components/LoadingSkeleton';

const OpsDashboard = lazy(() => import('./pages/OpsDashboard'));
const GuestPortal = lazy(() => import('./pages/GuestPortal'));
const AlertLogPage = lazy(() => import('./pages/AlertLogPage'));
const StrategicMapPage = lazy(() => import('./pages/StrategicMapPage'));
const CrisisTwinPage = lazy(() => import('./pages/CrisisTwinPage'));
const TeamPage = lazy(() => import('./pages/TeamPage'));
const AuditTrailPage = lazy(() => import('./pages/AuditTrailPage'));
const CCTVPage = lazy(() => import('./pages/CCTVPage'));

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <BrowserRouter>
            <Shell>
              <Suspense fallback={<LoadingSkeleton />}>
                <Routes>
                  <Route path="/" element={<OpsDashboard />} />
                  <Route path="/alerts" element={<AlertLogPage />} />
                  <Route path="/map" element={<StrategicMapPage />} />
                  <Route path="/twin" element={<CrisisTwinPage />} />
                  <Route path="/cctv" element={<CCTVPage />} />
                  <Route path="/team" element={<TeamPage />} />
                  <Route path="/audit" element={<AuditTrailPage />} />
                  <Route path="/guest" element={<GuestPortal />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </Shell>
          </BrowserRouter>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

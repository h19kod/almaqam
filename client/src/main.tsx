import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import Layout from './components/Layout';
import Home from './pages/Home';
import './styles/app.css';

const Maqamat = lazy(() => import('./pages/Maqamat'));
const MaqamPage = lazy(() => import('./pages/MaqamPage'));
const Studio = lazy(() => import('./pages/Studio'));
const Train = lazy(() => import('./pages/Train'));
const Gallery = lazy(() => import('./pages/Gallery'));
const Piece = lazy(() => import('./pages/Piece'));
const AuthPage = lazy(() => import('./pages/AuthPage'));
const Me = lazy(() => import('./pages/Me'));
const NotFound = lazy(() => import('./pages/NotFound'));
const Learn = lazy(() => import('./pages/Learn'));
const Lesson = lazy(() => import('./pages/Lesson'));
const Tuner = lazy(() => import('./pages/Tuner'));
const MapPage = lazy(() => import('./pages/MapPage'));
const Profile = lazy(() => import('./pages/Profile'));
const Leaders = lazy(() => import('./pages/Leaders'));
const Admin = lazy(() => import('./pages/Admin'));

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Layout>
          <Suspense fallback={<div className="page-loading" aria-busy="true" />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/maqamat" element={<Maqamat />} />
              <Route path="/maqam/:id" element={<MaqamPage />} />
              <Route path="/studio" element={<Studio />} />
              <Route path="/train" element={<Train />} />
              <Route path="/gallery" element={<Gallery />} />
              <Route path="/piece/:id" element={<Piece />} />
              <Route path="/login" element={<AuthPage mode="login" />} />
              <Route path="/register" element={<AuthPage mode="register" />} />
              <Route path="/me" element={<Me />} />
              <Route path="/learn" element={<Learn />} />
              <Route path="/learn/:id" element={<Lesson />} />
              <Route path="/tuner" element={<Tuner />} />
              <Route path="/map" element={<MapPage />} />
              <Route path="/u/:id" element={<Profile />} />
              <Route path="/leaders" element={<Leaders />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </Layout>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);

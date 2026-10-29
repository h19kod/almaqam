import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { stopAll } from '../lib/audio';

const NAV = [
  { to: '/maqamat', label: 'المقامات' },
  { to: '/studio', label: 'الاستوديو' },
  { to: '/train', label: 'درّب أذنك' },
  { to: '/gallery', label: 'المعرض' },
];

export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect x="8" y="38" width="16" height="10" rx="2" fill="var(--g-rast)" />
      <rect x="26" y="38" width="12" height="10" rx="2" fill="var(--g-bayati)" />
      <rect x="40" y="38" width="16" height="10" rx="2" fill="var(--ochre)" />
      <rect x="14" y="26" width="18" height="10" rx="2" fill="var(--g-bayati)" />
      <rect x="34" y="26" width="16" height="10" rx="2" fill="var(--g-rast)" />
      <rect x="22" y="14" width="20" height="10" rx="2" fill="var(--ochre)" />
    </svg>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
    stopAll();
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <>
      <a className="skip" href="#main">انتقل إلى المحتوى</a>
      <header className="top">
        <div className="top-inner">
          <Link to="/" className="brand" aria-label="مقام، الصفحة الرئيسية">
            <Mark />
            <span>مقام</span>
          </Link>
          <button className="menu-btn" aria-expanded={open} aria-controls="mainnav" onClick={() => setOpen(!open)}>
            <span className="sr">القائمة</span>
            <span aria-hidden="true" className={`burger ${open ? 'x' : ''}`}><i /><i /><i /></span>
          </button>
          <nav id="mainnav" className={`nav ${open ? 'open' : ''}`} aria-label="الرئيسية">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to}>{n.label}</NavLink>
            ))}
            <span className="nav-sep" aria-hidden="true" />
            {user ? (
              <>
                <NavLink to="/me" className="nav-user">{user.name}</NavLink>
                <button className="link-btn" onClick={async () => { await logout(); nav('/'); }}>خروج</button>
              </>
            ) : (
              <>
                <NavLink to="/login">دخول</NavLink>
                <Link to="/register" className="btn btn-small">حساب جديد</Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main id="main">{children}</main>
      <footer className="foot">
        <div className="foot-inner">
          <div className="foot-brand"><Mark size={22} /> مقام</div>
          <p>
            الأصوات هنا مولّدة في متصفحك بخوارزمية وتر مقطوف، والمسافات مضبوطة على السلّم العربي ذي الأربعة والعشرين ربعاً.
            اسمع بسمّاعات إن استطعت، فأرباع الأصوات تضيع في سمّاعات الهاتف الصغيرة.
          </p>
          <nav className="foot-nav" aria-label="روابط">
            {NAV.map((n) => <Link key={n.to} to={n.to}>{n.label}</Link>)}
          </nav>
        </div>
      </footer>
    </>
  );
}

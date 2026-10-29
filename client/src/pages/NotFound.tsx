import { Link } from 'react-router-dom';
import { playCents } from '../lib/audio';

export default function NotFound() {
  return (
    <div className="wrap page notfound">
      <h1 className="page-title">نغمة خارج المقام</h1>
      <p className="page-lede">هذه الصفحة غير موجودة. ربما تغيّر الرابط أو كُتب خطأً.</p>
      <div className="row">
        <Link className="btn" to="/">إلى البداية</Link>
        <button className="btn btn-ghost" onClick={() => { playCents(200); playCents(250, 0.4, 1.4); }}>اسمع النشاز</button>
      </div>
    </div>
  );
}

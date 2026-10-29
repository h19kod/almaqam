import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

const REASONS = ['محتوى مسيء', 'إعلان أو سبام', 'منسوخ من غيري دون إشارة'];

export default function ReportButton({ type, id, small = false }: { type: 'composition' | 'comment'; id: number; small?: boolean }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  if (state === 'sent') return <span className="muted">وصل البلاغ</span>;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState('sending');
    try {
      await api.report({ type, id, reason });
      setState('sent');
    } catch (err) {
      setState('error');
      setMsg(err instanceof ApiError ? err.message : 'تعذّر الإرسال');
    }
  }

  return (
    <span className="report">
      <button className={small ? 'link-btn' : 'btn btn-ghost'} aria-expanded={open}
        onClick={() => (user ? setOpen(!open) : nav('/login'))}>أبلغ</button>
      {open && (
        <form className="report-pop" onSubmit={send}>
          <fieldset>
            <legend>سبب البلاغ</legend>
            {REASONS.map((r) => (
              <label key={r} className="check">
                <input type="radio" name={`reason-${type}-${id}`} checked={reason === r} onChange={() => setReason(r)} />
                <span>{r}</span>
              </label>
            ))}
          </fieldset>
          <div className="row">
            <button className="btn btn-small" disabled={state === 'sending'}>أرسل البلاغ</button>
            <button type="button" className="link-btn" onClick={() => setOpen(false)}>إلغاء</button>
          </div>
          {state === 'error' && <p className="error" role="alert">{msg}</p>}
        </form>
      )}
    </span>
  );
}

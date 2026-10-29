// Usage: npm run make-admin -- someone@example.com
import { openDb } from './db.js';

const email = process.argv[2];
if (!email) {
  console.error('اكتب البريد: npm run make-admin -- someone@example.com');
  process.exit(1);
}
const r = openDb().prepare("UPDATE users SET role = 'admin' WHERE email = ?").run(email);
console.log(r.changes ? `${email} صار مشرفاً` : `لا يوجد مستخدم بالبريد ${email}`);
process.exit(r.changes ? 0 : 1);

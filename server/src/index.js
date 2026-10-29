import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { seedIfEmpty } from './seed.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const db = openDb();
seedIfEmpty(db);
const app = createApp(db, { clientDist: path.join(here, '..', '..', 'client', 'dist') });
const port = Number(process.env.PORT) || 4300;
app.listen(port, () => console.log(`مقام يعمل على http://localhost:${port}`));

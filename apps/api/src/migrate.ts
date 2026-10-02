import { pool } from './db';

const migration = await Bun.file(new URL('../migrations/001_init.sql', import.meta.url)).text();

try {
    await pool.query(migration);
    console.log('Database schema is up to date.');
} finally {
    await pool.end();
}
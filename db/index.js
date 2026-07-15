/* ─── db/index.js ───────────────────────────────────────────── */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/chikitsaalye',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
  console.error('Database pool error:', err.message);
});

// Test connection on startup
pool.query('SELECT 1').then(() => {
  console.log('✅ PostgreSQL connected');
}).catch(err => {
  console.warn('⚠️  PostgreSQL not connected:', err.message);
  console.warn('   The API will return empty data until a DB is configured.\n');
});

module.exports = pool;

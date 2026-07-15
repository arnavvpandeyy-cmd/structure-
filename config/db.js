/* ============================================================
   config/db.js — PostgreSQL Connection Pool
   ============================================================ */

const { Pool } = require('pg');

const pool = new Pool({
  host    : process.env.DB_HOST     || 'localhost',
  port    : parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'chikitsaalye',
  user    : process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',
  // Connection pool settings for high-volume OPD usage
  max               : 20,
  idleTimeoutMillis : 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err.message);
});

/**
 * Execute a parameterised SQL query.
 * @param {string} text    - SQL query with $1, $2... placeholders
 * @param {Array}  [params] - Parameter values
 * @returns {Promise<import('pg').QueryResult>}
 */
const query = (text, params) => pool.query(text, params);

/**
 * Get a dedicated client from the pool for transactions.
 */
const getClient = () => pool.connect();

/**
 * Run multiple queries in a transaction.
 * @param {Function} callback - Async function receiving { query } bound to the client
 */
const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback({ query: (t, p) => client.query(t, p) });
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Test DB connectivity at startup.
 */
const testConnection = async () => {
  try {
    const res = await pool.query('SELECT NOW() AS now');
    console.log(`✓ PostgreSQL connected — ${res.rows[0].now}`);
  } catch (err) {
    console.error('✗ PostgreSQL connection failed:', err.message);
    console.error('  Check DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD in .env');
    process.exit(1);
  }
};

module.exports = { query, getClient, transaction, testConnection, pool };

import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const isRemoteOrProd = process.env.NODE_ENV === 'production' || 
  (process.env.DB_HOST && process.env.DB_HOST !== 'localhost' && process.env.DB_HOST !== '127.0.0.1');

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost', 
  database: process.env.DB_DATABASE || 'pizarra',
  password: process.env.DB_PASSWORD || 'Medrano73697178',
  port: parseInt(process.env.DB_PORT) || 5432,
  ...(isRemoteOrProd ? { ssl: { rejectUnauthorized: false } } : {})
});

export default pool;


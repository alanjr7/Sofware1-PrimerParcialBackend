import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

import pool from './src/config/db.js';
import { getSalaById } from './src/models/sala.model.js';

async function check() {
    try {
        const rows = await getSalaById(6);
        if (rows.length === 0) {
            console.log("No room 6 found");
            return;
        }
        const row = rows[0];
        console.log("Sala:", row.id, row.nombre);
        const xml = JSON.parse(row.xml || "{}");
        const elNames = Array.isArray(xml.elements)
            ? xml.elements.map(e => `${e.name} (${e.id})`)
            : Object.values(xml.elements || {}).map(e => `${e.name} (${e.id})`);
        console.log("Elements in DB:", elNames);
        console.log("Connections in DB:", JSON.stringify(xml.connections || xml.relationships, null, 2));
    } catch(e) {
        console.error("DB query error:", e);
    } finally {
        await pool.end();
        process.exit(0);
    }
}
check();

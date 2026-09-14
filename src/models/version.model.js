import pool from '../config/db.js';

// Inicializar tabla si no existe
export const initVersionTable = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS "SalaVersiones" (
                id SERIAL PRIMARY KEY,
                "salaId" INT NOT NULL REFERENCES "Salas"(id) ON DELETE CASCADE,
                "userId" INT REFERENCES "Users"(id) ON DELETE SET NULL,
                "versionNumber" INT NOT NULL,
                "message" VARCHAR(255) NOT NULL,
                "xml" TEXT NOT NULL,
                "metadata" JSONB,
                "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_sala_versiones_salaid ON "SalaVersiones"("salaId", "versionNumber" DESC);
        `);
        console.log('✅ Tabla SalaVersiones verificada / inicializada correctamente');
    } catch (error) {
        console.error('❌ Error inicializando tabla SalaVersiones:', error);
    }
};

// Crear una nueva versión para una sala
export const createVersion = async (salaId, userId, message, xml, metadata = {}) => {
    // Obtener el siguiente número de versión para esta sala
    const countRes = await pool.query(
        `SELECT COALESCE(MAX("versionNumber"), 0) + 1 AS next_version FROM "SalaVersiones" WHERE "salaId" = $1`,
        [salaId]
    );
    const nextVersion = countRes.rows[0].next_version;

    const result = await pool.query(
        `INSERT INTO "SalaVersiones" ("salaId", "userId", "versionNumber", "message", "xml", "metadata")
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, "salaId", "userId", "versionNumber", "message", "metadata", "createdAt"`,
        [salaId, userId || null, nextVersion, message || `Versión ${nextVersion}`, xml, JSON.stringify(metadata)]
    );
    return result.rows[0];
};

// Obtener todas las versiones de una sala (sin traer el xml pesado en la lista)
export const getVersionsBySalaId = async (salaId) => {
    const result = await pool.query(
        `SELECT v.id, v."salaId", v."userId", v."versionNumber", v."message", v."metadata", v."createdAt",
                u.name AS "userName", u.email AS "userEmail"
         FROM "SalaVersiones" v
         LEFT JOIN "Users" u ON v."userId" = u.id
         WHERE v."salaId" = $1
         ORDER BY v."versionNumber" DESC`,
        [salaId]
    );
    return result.rows;
};

// Obtener una versión específica por su ID (incluyendo el XML completo)
export const getVersionById = async (versionId, salaId) => {
    const query = salaId
        ? `SELECT v.*, u.name AS "userName" FROM "SalaVersiones" v LEFT JOIN "Users" u ON v."userId" = u.id WHERE v.id = $1 AND v."salaId" = $2`
        : `SELECT v.*, u.name AS "userName" FROM "SalaVersiones" v LEFT JOIN "Users" u ON v."userId" = u.id WHERE v.id = $1`;
    const params = salaId ? [versionId, salaId] : [versionId];
    const result = await pool.query(query, params);
    return result.rows[0] || null;
};

// Eliminar una versión
export const deleteVersion = async (versionId, salaId) => {
    const result = await pool.query(
        `DELETE FROM "SalaVersiones" WHERE id = $1 AND "salaId" = $2 RETURNING id`,
        [versionId, salaId]
    );
    return result.rows[0] || null;
};

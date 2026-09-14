import pool from '../config/db.js';

// Inicializar tablas de Reuniones y Participantes
export const initReunionTables = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS "Reuniones" (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                fecha_reunion TIMESTAMP WITH TIME ZONE NOT NULL,
                jitsi_room_name VARCHAR(255) NOT NULL,
                sala_id INT REFERENCES "Salas"(id) ON DELETE SET NULL,
                "userId" INT NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
                eliminar BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS "UserReuniones" (
                id SERIAL PRIMARY KEY,
                reunion_id INT NOT NULL REFERENCES "Reuniones"(id) ON DELETE CASCADE,
                "userId" INT NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT unique_user_reunion UNIQUE (reunion_id, "userId")
            );

            CREATE INDEX IF NOT EXISTS idx_reuniones_userid ON "Reuniones"("userId");
            CREATE INDEX IF NOT EXISTS idx_userreuniones_userid ON "UserReuniones"("userId");
            CREATE INDEX IF NOT EXISTS idx_userreuniones_reunionid ON "UserReuniones"(reunion_id);
        `);
        console.log('✅ Tablas Reuniones y UserReuniones verificadas / inicializadas correctamente');
    } catch (error) {
        console.error('❌ Error inicializando tablas de Reuniones:', error);
    }
};

// Crear nueva reunión con invitados opcionales
export const createReunion = async ({ title, description, fecha_reunion, jitsi_room_name, sala_id, userId, invitados = [] }) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const result = await client.query(
            `INSERT INTO "Reuniones" (title, description, fecha_reunion, jitsi_room_name, sala_id, "userId")
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [title, description || '', fecha_reunion, jitsi_room_name, sala_id || null, userId]
        );
        const nuevaReunion = result.rows[0];

        if (Array.isArray(invitados) && invitados.length > 0) {
            for (const invitadoId of invitados) {
                const numId = parseInt(invitadoId, 10);
                if (!isNaN(numId) && numId !== userId) {
                    await client.query(
                        `INSERT INTO "UserReuniones" (reunion_id, "userId")
                         VALUES ($1, $2)
                         ON CONFLICT (reunion_id, "userId") DO NOTHING`,
                        [nuevaReunion.id, numId]
                    );
                }
            }
        }

        await client.query('COMMIT');
        return nuevaReunion;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

// Obtener todas las reuniones creadas por el usuario
export const getReunionesByUserId = async (userId) => {
    const result = await pool.query(
        `SELECT r.*, s.title AS "salaTitulo", u.name AS "creadorNombre", u.email AS "creadorEmail",
                COALESCE(
                    (SELECT json_agg(json_build_object('id', iu.id, 'name', iu.name, 'email', iu.email))
                     FROM "UserReuniones" ur
                     JOIN "Users" iu ON ur."userId" = iu.id
                     WHERE ur.reunion_id = r.id), '[]'::json
                ) AS "invitados"
         FROM "Reuniones" r
         LEFT JOIN "Salas" s ON r.sala_id = s.id
         LEFT JOIN "Users" u ON r."userId" = u.id
         WHERE r."userId" = $1 AND r.eliminar = false
         ORDER BY r.fecha_reunion ASC`,
        [userId]
    );
    return result.rows;
};

// Obtener todas las reuniones en las que el usuario ha sido invitado
export const getReunionesInvitadas = async (userId) => {
    const result = await pool.query(
        `SELECT r.*, s.title AS "salaTitulo", u.name AS "creadorNombre", u.email AS "creadorEmail",
                COALESCE(
                    (SELECT json_agg(json_build_object('id', iu.id, 'name', iu.name, 'email', iu.email))
                     FROM "UserReuniones" ur
                     JOIN "Users" iu ON ur."userId" = iu.id
                     WHERE ur.reunion_id = r.id), '[]'::json
                ) AS "invitados"
         FROM "UserReuniones" ur
         JOIN "Reuniones" r ON ur.reunion_id = r.id
         LEFT JOIN "Salas" s ON r.sala_id = s.id
         LEFT JOIN "Users" u ON r."userId" = u.id
         WHERE ur."userId" = $1 AND r.eliminar = false
         ORDER BY r.fecha_reunion ASC`,
        [userId]
    );
    return result.rows;
};

// Obtener reunión por ID
export const getReunionById = async (id) => {
    const result = await pool.query(
        `SELECT r.*, s.title AS "salaTitulo", u.name AS "creadorNombre", u.email AS "creadorEmail",
                COALESCE(
                    (SELECT json_agg(json_build_object('id', iu.id, 'name', iu.name, 'email', iu.email))
                     FROM "UserReuniones" ur
                     JOIN "Users" iu ON ur."userId" = iu.id
                     WHERE ur.reunion_id = r.id), '[]'::json
                ) AS "invitados"
         FROM "Reuniones" r
         LEFT JOIN "Salas" s ON r.sala_id = s.id
         LEFT JOIN "Users" u ON r."userId" = u.id
         WHERE r.id = $1 AND r.eliminar = false`,
        [id]
    );
    return result.rows[0] || null;
};

// Agregar invitado a una reunión existente
export const addInvitadoToReunion = async (reunionId, userId) => {
    const result = await pool.query(
        `INSERT INTO "UserReuniones" (reunion_id, "userId")
         VALUES ($1, $2)
         ON CONFLICT (reunion_id, "userId") DO NOTHING
         RETURNING *`,
        [reunionId, userId]
    );
    return result.rows[0] || null;
};

// Eliminar / Cancelar reunión (soft delete)
export const deleteReunion = async (id, userId) => {
    const result = await pool.query(
        `UPDATE "Reuniones" SET eliminar = true WHERE id = $1 AND "userId" = $2 RETURNING id`,
        [id, userId]
    );
    return result.rows[0] || null;
};

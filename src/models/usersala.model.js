import pool from '../config/db.js';

export const createUserSala = async (userId, salas_id) => {
    const existingEntry = await pool.query(
        `SELECT * FROM "Usersala" WHERE userId = $1 AND salas_id = $2.`,
        [userId, salas_id]
    );
    if (existingEntry.rows.length > 0) {
        const error = new Error('El usuario ya está asociado a esta sala.');
        error.statusCode = 400;
        throw error;
    }
    const result = await pool.query(
        `INSERT INTO "Usersala" (userId, salas_id) VALUES ($1, $2) RETURNING *`,
        [userId, salas_id]
    );
    return result.rows[0];
};

export const getUserSalaById = async (id) => {
    const result = await pool.query(
        'SELECT * FROM "Usersala" WHERE id = $1',
        [id]
    );
    return result.rows[0];
};

export const getUserSalas = async (userId) => {
    const result = await pool.query(
        `SELECT s.*
         FROM "Usersala" us
         JOIN "Salas" s ON us.salas_id = s.id
         WHERE us.userId = $1 AND s.eliminar = false`,
        [userId]
    );
    return result.rows;
};

export const getUsersBySala = async (salaId) => {
    console.log(`👥 DB: Buscando usuarios en sala ${salaId}`);
    const result = await pool.query(
        `SELECT u.id as "userId", u.name, u.email, us.id as "userSalaId"
         FROM "Usersala" us
         JOIN "Users" u ON us.userId = u.id
         WHERE us.salas_id = $1`,
        [salaId]
    );
    console.log(`👥 DB: Encontrados ${result.rows.length} usuarios en sala ${salaId}`);
    return result.rows;
};

export const deleteUserSala = async (id) => {
    const result = await pool.query(
        'DELETE FROM "Usersala" WHERE id = $1 RETURNING *',
        [id]
    );
    return result.rows[0];
};



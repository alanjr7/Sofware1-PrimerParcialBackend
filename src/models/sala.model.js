import pool from '../config/db.js';

export const createSala = async (title, xml, description, userId) => {
    const result = await pool.query(
        `INSERT INTO "Salas" (title, xml, description, userId) VALUES ($1, $2, $3, $4) RETURNING *`,
        [title, xml, description, userId]
    );
    return result.rows[0];
};

export const getSalaById = async (id) => {
    console.log(`🗃️ DB: Ejecutando query para sala ID: ${id}`);
    const result = await pool.query(
        'SELECT * FROM "Salas" WHERE id = $1 AND eliminar = false',
        [id]
    );
    console.log(`🗃️ DB: Query ejecutada, filas encontradas: ${result.rows.length}`);
    
    if (result.rows.length > 0) {
        const sala = result.rows[0];
        console.log(`🗃️ DB: Sala encontrada - ID: ${sala.id}, Title: "${sala.title}"`);
        console.log(`🗃️ DB: XML length: ${sala.xml ? sala.xml.length : 0} chars`);
        if (sala.xml) {
            console.log(`🗃️ DB: XML preview:`, sala.xml.substring(0, 50) + '...');
        }
    }
    
    return result.rows;
};

export const getSala = async (userId) => {
    const result = await pool.query('SELECT * FROM "Salas" WHERE userId = $1 and eliminar = false', [userId]);
    return result.rows;
};

export const updateSala = async (id, title, xml, description, io = null) => {
    // Soporte para paso de opciones por objeto: updateSala(id, { xml, title, description, io })
    if (title && typeof title === 'object' && xml === undefined && description === undefined) {
        const opts = title;
        title = opts.title;
        xml = opts.xml;
        description = opts.description;
        io = opts.io || io;
    }

    console.log(`🔧 UPDATE: Iniciando actualización para sala ID: ${id}`);
    console.log(`🔧 UPDATE: ¿Tiene instancia IO para broadcast?: ${!!io}`);
    
    let fields = [];
    let values = [];
    let counter = 1;
    
    if (title !== undefined && title !== null) {
        fields.push(`title = $${counter++}`);
        values.push(title);
        console.log(`🔧 UPDATE: Actualizando campo title: "${title}"`);
    }
    
    if (xml !== undefined && xml !== null) {
        fields.push(`xml = $${counter++}`);
        values.push(xml);
        console.log(`🔧 UPDATE: Actualizando campo xml: ${xml.substring(0, 50)}... (${xml.length} chars)`);
    }
    
    if (description !== undefined && description !== null) {
        fields.push(`description = $${counter++}`);
        values.push(description);
        console.log(`🔧 UPDATE: Actualizando campo description: "${description}"`);
    }
    
    if (fields.length === 0) {
        console.log(`❌ UPDATE: Error - No hay campos para actualizar en sala ${id}`);
        throw new Error('No hay campos para actualizar');
    }
    
    values.push(id);
    const query = `UPDATE "Salas" SET ${fields.join(', ')} WHERE id = $${counter} AND eliminar = false RETURNING *`;
    console.log(`🔧 UPDATE: Query a ejecutar: ${query}`);
    console.log(`🔧 UPDATE: Valores de parametrización:`, values);
    
    const result = await pool.query(query, values);
    
    if (result.rows.length > 0) {
        const updatedSala = result.rows[0];
        console.log(`✅ UPDATE: Sala ${id} actualizada correctamente - ID en DB: ${updatedSala.id}`);
        
        // 🚀 MEJORADO: Broadcast más robusto y con mejor logging
        if (xml !== undefined && xml !== null && io) {
            console.log(`📡 BROADCAST: Iniciando notificación a usuarios de sala ${id}`);
            
            try {
                // Parsear el XML para enviarlo como estado
                const parsedState = JSON.parse(xml);
                
                // Verificar si hay usuarios conectados a la sala
                const clientesEnSala = io.sockets.adapter.rooms.get(`sala_${id}`);
                const numClientesEnSala = clientesEnSala ? clientesEnSala.size : 0;
                console.log(`📡 BROADCAST: ${numClientesEnSala} clientes conectados en sala_${id}`);
                
                if (numClientesEnSala > 0) {
                    // Emitir a todos los usuarios en la sala
                    io.to(`sala_${id}`).emit('xmlActualizado', {
                        salaId: parseInt(id, 10), // Asegurar que sea número
                        nuevoEstado: parsedState,
                        timestamp: Date.now(),
                        source: 'database_update',
                        message: `✅ Pizarra sincronizada desde base de datos (${new Date().toLocaleTimeString()})`
                    });
                    
                    console.log(`✅ BROADCAST: Actualización XML enviada a ${numClientesEnSala} usuarios en sala_${id}`);
                } else {
                    console.log(`ℹ️ BROADCAST: No hay usuarios conectados en sala_${id} - no se envía broadcast`);
                }
            } catch (error) {
                console.error(`❌ BROADCAST: Error parseando XML para sala ${id}:`, error);
            }
        } else if (xml !== undefined && xml !== null && !io) {
            console.log(`⚠️ BROADCAST: Se actualizó XML pero no hay instancia IO disponible para broadcast`);
        }
        
        return updatedSala;
    } else {
        console.log(`❌ UPDATE: Error - No se encontró la sala ${id} para actualizar`);
        throw new Error(`Sala con ID ${id} no encontrada o ya eliminada`);
    }
};

export const deleteSala = async (id) => {
    const result = await pool.query(
        'UPDATE "Salas" SET eliminar = true WHERE id = $1 RETURNING *',
        [id]
    );
    return result.rows[0];
};

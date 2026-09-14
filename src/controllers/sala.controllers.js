import { createSala, getSalaById, getSala, updateSala, deleteSala } from '../models/sala.model.js';
import { catchedAsync, response } from '../middlewares/catchedAsync.js';

class SalaController {
    constructor() {}

    register = catchedAsync(async (req, res) => {
        const { title, xml, description } = req.body;
        const userId = req.user.id;
        const sala = await createSala(title, xml, description, userId);
        response(res, 201, sala);
    });

    update = catchedAsync(async (req, res) => {
        const { title, xml, description } = req.body;
        const { id } = req.params;
        
        console.log(`🛠️ Controller: Petición de actualización para sala ID: ${id}`);
        console.log(`🛠️ Controller: Campos recibidos:`, {
            title: title ? 'SI' : 'NO',
            xml: xml ? `SI (${xml.length} chars)` : 'NO',
            description: description ? 'SI' : 'NO'
        });
        
        if (!title && !xml && !description) {
            console.log(`❌ Controller: Petición rechazada - No hay campos para actualizar`);
            return response(res, 400, { 
                error: true, 
                message: 'Debe proporcionar al menos un campo: title, xml o description.' 
            });
        }
        
        try {
            console.log(`🔄 Controller: Intentando actualizar sala ${id} en la base de datos`);
            
            // 🚀 NUEVO: Pasar la instancia io para broadcast automático
            const io = req.app.get('io');
            const sala = await updateSala(id, title, xml, description, io);
            console.log(`✅ Controller: Sala ${id} actualizada correctamente`);
            console.log(`📡 Controller: Broadcast automático realizado a usuarios conectados`);
            
            response(res, 200, {
                success: true,
                message: 'Sala actualizada correctamente',
                data: sala
            });
            
        } catch (error) {
            console.error(`❌ Controller: Error actualizando sala ${id}:`, error.message);
            response(res, 500, { 
                error: true, 
                message: 'Error interno del servidor al actualizar la sala' 
            });
        }
    });

    getSalaById = catchedAsync(async (req, res) => {
        const { id } = req.params;
        console.log(`🔍 Backend: Buscando sala con ID: ${id}`);
        
        const sala = await getSalaById(id);
        console.log(`📦 Backend: Resultado de DB para ID ${id}:`, sala);
        
        // Log del contenido XML (primeros 100 caracteres)
        if (sala && sala.length > 0 && sala[0].xml) {
            console.log(`📄 Backend: XML para sala ${id} (primeros 100 chars):`, sala[0].xml.substring(0, 100) + '...');
        } else {
            console.log(`⚠️ Backend: Sala ${id} sin XML o vacía`);
        }
        
        console.log(`✅ Backend: Enviando respuesta para sala ${id}`);
        response(res, 200, sala);
    });

    getSalas = catchedAsync(async (req, res) => {
        const userId = req.user?.id || 1; // Temporal: usar userId por defecto
        const salas = await getSala(userId);
        response(res, 200, salas);
    });

    delete = catchedAsync(async (req, res) => {
        const { id } = req.params;
        const sala = await deleteSala(id);
        response(res, 200, sala);
    });
}

export default new SalaController();

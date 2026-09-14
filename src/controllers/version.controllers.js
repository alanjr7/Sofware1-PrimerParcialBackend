import { createVersion, getVersionsBySalaId, getVersionById, deleteVersion } from '../models/version.model.js';
import { getSalaById, updateSala } from '../models/sala.model.js';
import { catchedAsync, response } from '../middlewares/catchedAsync.js';

class VersionController {
    // Guardar una nueva versión (Commit / Snapshot)
    create = catchedAsync(async (req, res) => {
        const { salaId } = req.params;
        let { message, xml, metadata } = req.body;
        const userId = req.user?.id || null;

        console.log(`📌 VersionController: Creando versión para sala ID: ${salaId}`);

        // Si no se envía XML en el body, obtener el XML actual de la sala
        if (!xml) {
            const salaData = await getSalaById(salaId);
            if (!salaData || salaData.length === 0 || !salaData[0].xml) {
                return res.status(400).json({
                    error: true,
                    message: 'No hay contenido XML en la sala para versionar'
                });
            }
            xml = salaData[0].xml;
        }

        // Si no se proporcionó metadata, extraer conteos básicos del XML / JSON
        if (!metadata) {
            try {
                const parsed = JSON.parse(xml);
                const elements = parsed.elements || parsed.data?.elements || {};
                const numClasses = Array.isArray(elements) ? elements.length : Object.keys(elements).length;
                const connections = parsed.connections || parsed.data?.connections || [];
                metadata = {
                    numClasses,
                    numRelations: connections.length
                };
            } catch (e) {
                metadata = { numClasses: 0, numRelations: 0 };
            }
        }

        const nuevaVersion = await createVersion(salaId, userId, message, xml, metadata);

        // Notificar a todos los usuarios conectados en la sala vía Socket.IO
        const io = req.app.get('io');
        if (io) {
            io.to(`sala_${salaId}`).emit('nuevaVersionCreada', {
                salaId: parseInt(salaId, 10),
                version: nuevaVersion,
                message: `🔖 Nueva versión #${nuevaVersion.versionNumber} creada: "${nuevaVersion.message}"`,
                timestamp: Date.now()
            });
        }

        response(res, 201, nuevaVersion);
    });

    // Listar historial de versiones de una sala
    getVersions = catchedAsync(async (req, res) => {
        const { salaId } = req.params;
        const versiones = await getVersionsBySalaId(salaId);
        response(res, 200, versiones);
    });

    // Obtener una versión específica (incluye XML)
    getVersionById = catchedAsync(async (req, res) => {
        const { salaId, versionId } = req.params;
        const version = await getVersionById(versionId, salaId);
        if (!version) {
            return res.status(404).json({
                error: true,
                message: 'Versión no encontrada'
            });
        }
        response(res, 200, version);
    });

    // Restaurar una versión (Checkout / Revert)
    restore = catchedAsync(async (req, res) => {
        const { salaId, versionId } = req.params;
        const version = await getVersionById(versionId, salaId);
        if (!version) {
            return res.status(404).json({
                error: true,
                message: 'Versión no encontrada para restaurar'
            });
        }

        const io = req.app.get('io');
        
        // Actualizar la sala activa con el XML de la versión
        const updatedSala = await updateSala(salaId, null, version.xml, null, io);

        // Notificación de restauración en tiempo real
        if (io) {
            io.to(`sala_${salaId}`).emit('versionRestaurada', {
                salaId: parseInt(salaId, 10),
                versionNumber: version.versionNumber,
                message: `🔄 Diagrama restaurado a la versión #${version.versionNumber} ("${version.message}")`,
                timestamp: Date.now()
            });
        }

        response(res, 200, {
            message: `Pizarra restaurada con éxito a la versión #${version.versionNumber}`,
            version,
            sala: updatedSala
        });
    });

    // Eliminar una versión del historial
    delete = catchedAsync(async (req, res) => {
        const { salaId, versionId } = req.params;
        const deleted = await deleteVersion(versionId, salaId);
        if (!deleted) {
            return res.status(404).json({
                error: true,
                message: 'Versión no encontrada para eliminar'
            });
        }
        response(res, 200, { message: 'Versión eliminada correctamente', id: deleted.id });
    });
}

export default new VersionController();

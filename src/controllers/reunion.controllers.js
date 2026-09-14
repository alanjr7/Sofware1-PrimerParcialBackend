import {
    createReunion,
    getReunionesByUserId,
    getReunionesInvitadas,
    getReunionById,
    addInvitadoToReunion,
    deleteReunion
} from '../models/reunion.model.js';
import crypto from 'crypto';

export const registerReunion = async (req, res) => {
    try {
        const { title, description, fecha_reunion, sala_id, invitados } = req.body;
        const userId = req.user.id;

        if (!title || !fecha_reunion) {
            return res.status(400).json({
                error: true,
                message: 'El título y la fecha/hora de la reunión son obligatorios.'
            });
        }

        // Generar un nombre de sala único y seguro para Jitsi Meet
        const uniqueId = crypto.randomBytes(6).toString('hex');
        const sanitizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 20);
        const jitsi_room_name = `UMLStudio_${sanitizedTitle}_${Date.now()}_${uniqueId}`;

        const parsedInvitados = Array.isArray(invitados)
            ? invitados
            : (invitados ? [invitados] : []);

        const nuevaReunion = await createReunion({
            title,
            description,
            fecha_reunion,
            jitsi_room_name,
            sala_id: sala_id ? parseInt(sala_id, 10) : null,
            userId,
            invitados: parsedInvitados
        });

        return res.status(201).json({
            error: false,
            message: 'Reunión programada exitosamente.',
            data: nuevaReunion
        });
    } catch (error) {
        console.error('❌ Error al crear reunión:', error);
        return res.status(500).json({
            error: true,
            message: 'Error interno al registrar la reunión.'
        });
    }
};

export const getMisReuniones = async (req, res) => {
    try {
        const userId = req.user.id;
        const [creadas, invitadas] = await Promise.all([
            getReunionesByUserId(userId),
            getReunionesInvitadas(userId)
        ]);

        return res.status(200).json({
            error: false,
            data: {
                creadas,
                invitadas,
                total: creadas.length + invitadas.length
            }
        });
    } catch (error) {
        console.error('❌ Error al obtener reuniones:', error);
        return res.status(500).json({
            error: true,
            message: 'Error al recuperar la lista de reuniones.'
        });
    }
};

export const getDetalleReunion = async (req, res) => {
    try {
        const { id } = req.params;
        const reunion = await getReunionById(id);

        if (!reunion) {
            return res.status(404).json({
                error: true,
                message: 'Reunión no encontrada.'
            });
        }

        return res.status(200).json({
            error: false,
            data: reunion
        });
    } catch (error) {
        console.error('❌ Error al obtener detalle de reunión:', error);
        return res.status(500).json({
            error: true,
            message: 'Error al obtener la reunión.'
        });
    }
};

export const invitarAColaborador = async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({
                error: true,
                message: 'Debe especificar el usuario a invitar.'
            });
        }

        const reunion = await getReunionById(id);
        if (!reunion) {
            return res.status(404).json({
                error: true,
                message: 'Reunión no encontrada.'
            });
        }

        const nuevoInvitado = await addInvitadoToReunion(parseInt(id, 10), parseInt(userId, 10));

        return res.status(200).json({
            error: false,
            message: 'Colaborador invitado a la reunión exitosamente.',
            data: nuevoInvitado
        });
    } catch (error) {
        console.error('❌ Error al invitar a la reunión:', error);
        return res.status(500).json({
            error: true,
            message: 'Error al invitar al colaborador.'
        });
    }
};

export const cancelarReunion = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const resultado = await deleteReunion(parseInt(id, 10), userId);

        if (!resultado) {
            return res.status(403).json({
                error: true,
                message: 'No tienes permisos para cancelar esta reunión o ya no existe.'
            });
        }

        return res.status(200).json({
            error: false,
            message: 'Reunión cancelada exitosamente.'
        });
    } catch (error) {
        console.error('❌ Error al cancelar reunión:', error);
        return res.status(500).json({
            error: true,
            message: 'Error interno al cancelar la reunión.'
        });
    }
};

export default {
    registerReunion,
    getMisReuniones,
    getDetalleReunion,
    invitarAColaborador,
    cancelarReunion
};

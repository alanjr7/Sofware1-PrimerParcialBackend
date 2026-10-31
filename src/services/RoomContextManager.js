/**
 * RoomContextManager
 * 
 * Gestor en memoria de contexto multi-nivel para salas de diseño colaborativo.
 * Mantiene:
 *  - Diagrama actual de la sala
 *  - Ventana deslizante de últimos mensajes grupales (máximo 30)
 *  - Hilos y contexto temático aislado por usuario (userId)
 *  - Propuestas de cambio de diagrama pendientes con TTL de 2 minutos
 */
export class RoomContextManager {
    constructor() {
        /**
         * Map de salas: salaId -> { diagram, messages, userThreads, pendingProposals }
         * @type {Map<string, Object>}
         */
        this.rooms = new Map();
    }

    /**
     * Inicializa la estructura en memoria para una sala si no existe.
     * @param {string} salaId 
     * @param {Object|null} initialDiagram 
     * @returns {Object} Contexto de la sala
     */
    initRoom(salaId, initialDiagram = null) {
        if (!this.rooms.has(salaId)) {
            this.rooms.set(salaId, {
                diagram: initialDiagram || { elements: [], relationships: [] },
                messages: [], // max 30
                userThreads: new Map(), // userId -> { queries: [], lastInquiry: '', role: '' }
                pendingProposals: new Map() // userId -> { proposal, timestamp, expiresAt }
            });
        } else if (initialDiagram && (!this.rooms.get(salaId).diagram || this.rooms.get(salaId).diagram.elements.length === 0)) {
            this.rooms.get(salaId).diagram = initialDiagram;
        }

        return this.rooms.get(salaId);
    }

    /**
     * Obtiene el contexto de la sala (creándolo si no existe).
     * @param {string} salaId 
     * @returns {Object}
     */
    getRoom(salaId) {
        if (!this.rooms.has(salaId)) {
            return this.initRoom(salaId);
        }
        return this.rooms.get(salaId);
    }

    /**
     * Actualiza el diagrama en la sala especificada.
     * @param {string} salaId 
     * @param {Object} diagram 
     * @returns {Object} Diagrama actualizado
     */
    updateDiagram(salaId, diagram) {
        const room = this.getRoom(salaId);
        room.diagram = diagram;
        return room.diagram;
    }

    /**
     * Retorna el diagrama actual de la sala.
     * @param {string} salaId 
     * @returns {Object}
     */
    getDiagram(salaId) {
        const room = this.getRoom(salaId);
        return room.diagram;
    }

    /**
     * Agrega un mensaje al historial grupal, manteniendo como máximo 30 mensajes.
     * @param {string} salaId 
     * @param {Object} message 
     * @returns {Array<Object>} Lista de mensajes actualizados
     */
    addMessage(salaId, message) {
        const room = this.getRoom(salaId);
        room.messages.push(message);
        if (room.messages.length > 30) {
            room.messages = room.messages.slice(-30);
        }
        return room.messages;
    }

    /**
     * Retorna los últimos N mensajes formateados de la sala.
     * @param {string} salaId 
     * @param {number} limit 
     * @returns {Array<Object>}
     */
    getRecentMessages(salaId, limit = 15) {
        const room = this.getRoom(salaId);
        if (limit <= 0) return [];
        return room.messages.slice(-limit);
    }

    /**
     * Registra una interacción en el hilo conversacional específico del usuario.
     * @param {string} salaId 
     * @param {string} userId 
     * @param {string} queryText 
     * @param {string|null} aiResponse 
     * @returns {Object} Hilo del usuario
     */
    recordUserQuery(salaId, userId, queryText, aiResponse = null) {
        const room = this.getRoom(salaId);
        if (!room.userThreads.has(userId)) {
            room.userThreads.set(userId, {
                queries: [],
                lastInquiry: '',
                role: ''
            });
        }

        const thread = room.userThreads.get(userId);
        thread.queries.push({
            query: queryText,
            response: aiResponse,
            timestamp: Date.now()
        });
        thread.lastInquiry = queryText;

        return thread;
    }

    /**
     * Retorna el contexto temático e historial del usuario en la sala.
     * @param {string} salaId 
     * @param {string} userId 
     * @returns {Object}
     */
    getUserContext(salaId, userId) {
        const room = this.getRoom(salaId);
        if (!room.userThreads.has(userId)) {
            return {
                queries: [],
                lastInquiry: '',
                role: ''
            };
        }
        return room.userThreads.get(userId);
    }

    /**
     * Registra una propuesta pendiente para el usuario con TTL (por defecto 2 minutos = 120000ms).
     * @param {string} salaId 
     * @param {string} userId 
     * @param {Object} proposal 
     * @param {number} ttlMs 
     * @returns {Object} Entrada de propuesta creada
     */
    setPendingProposal(salaId, userId, proposal, ttlMs = 120000) {
        const room = this.getRoom(salaId);
        const entry = {
            proposal,
            timestamp: Date.now(),
            expiresAt: Date.now() + ttlMs
        };
        room.pendingProposals.set(userId, entry);
        return entry;
    }

    /**
     * Retorna la propuesta pendiente si existe y no ha expirado.
     * Si expiró, la limpia automáticamente y retorna null.
     * @param {string} salaId 
     * @param {string} userId 
     * @returns {Object|null}
     */
    getPendingProposal(salaId, userId) {
        const room = this.getRoom(salaId);
        const entry = room.pendingProposals.get(userId);
        if (!entry) {
            return null;
        }

        if (Date.now() > entry.expiresAt) {
            room.pendingProposals.delete(userId);
            return null;
        }

        return entry.proposal;
    }

    /**
     * Elimina la propuesta pendiente para el usuario en la sala.
     * @param {string} salaId 
     * @param {string} userId 
     * @returns {boolean} True si existía y fue eliminada
     */
    clearPendingProposal(salaId, userId) {
        const room = this.getRoom(salaId);
        return room.pendingProposals.delete(userId);
    }
}

const defaultRoomContextManager = new RoomContextManager();
export default defaultRoomContextManager;

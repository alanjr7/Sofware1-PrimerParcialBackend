import BaseAgent from './BaseAgent.js';
import defaultRoomContextManager from '../services/RoomContextManager.js';
import OpenAI from 'openai';

/**
 * TeamMemberAIAgent
 * 
 * Agente Colega Colaborador que actúa como un miembro más del equipo de desarrollo
 * y mentor de diseño de software/UML.
 * 
 * Capacidades principales:
 * - Filtra cuándo intervenir y cuándo guardar silencio en conversaciones casuales.
 * - Reconoce a los integrantes del equipo por su nombre.
 * - Explica conceptos de diseño UML y principios SOLID como mentor pedagógico.
 * - Gestiona el flujo seguro de propuesta de cambios al diagrama:
 *   Proponer -> Esperar confirmación -> Aplicar a la pizarra.
 */
export class TeamMemberAIAgent extends BaseAgent {
    /**
     * @param {Object} [roomContextManager] Instancia de RoomContextManager
     * @param {Object|null} [openaiClient] Cliente OpenAI opcional (inyectable para pruebas)
     */
    constructor(roomContextManager = defaultRoomContextManager, openaiClient = null) {
        super(
            'TeamMemberAIAgent',
            'AI Team Member & Software Architect',
            'Compañero de equipo colaborativo y mentor de arquitectura UML en tiempo real'
        );

        this.roomContextManager = roomContextManager || defaultRoomContextManager;

        if (openaiClient) {
            this.openai = openaiClient;
        } else if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here') {
            this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        } else {
            this.openai = null;
        }
    }

    /**
     * Determina si el texto es una confirmación afirmativa para una propuesta previa.
     * @param {string} text 
     * @returns {boolean}
     */
    _isAffirmative(text) {
        if (!text || typeof text !== 'string') return false;
        const clean = text.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        // Descartar si incluye negaciones o cancelaciones explícitas
        if (/\b(no|cancela|cancelar|espera|deten|rechazo)\b/.test(clean)) {
            return false;
        }

        const affirmativePatterns = [
            /\bsi\b/,
            /\bdale\b/,
            /\bhazlo\b/,
            /\bprocede\b/,
            /\bproceder\b/,
            /\bcambialo\b/,
            /\baplica\b/,
            /\baplicalos?\b/,
            /\bok\b/,
            /\bokay\b/,
            /\badelante\b/,
            /\bclaro\b/,
            /\bde acuerdo\b/,
            /\bafirmativo\b/,
            /\bconfirmo\b/
        ];

        return affirmativePatterns.some(pattern => pattern.test(clean));
    }

    /**
     * Detecta si el mensaje menciona directamente a la IA o su rol.
     * @param {string} text 
     * @returns {boolean}
     */
    _hasAIMention(text) {
        if (!text || typeof text !== 'string') return false;
        const clean = text.trim().toLowerCase();
        const mentionPatterns = [
            /@(ia|arquitecto|copilot|ai)\b/i,
            /\b(ia|arquitecto|copilot|ai):\s*/i
        ];

        return mentionPatterns.some(pattern => pattern.test(clean));
    }

    /**
     * Determina si el mensaje contiene una consulta técnica, pedagógica o de diseño UML.
     * @param {string} text 
     * @returns {boolean}
     */
    _isTechnicalQuery(text) {
        if (!text || typeof text !== 'string') return false;
        const clean = text.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        // Preguntas directas de consulta o criterio técnico
        const questionPatterns = [
            /que opinas/i,
            /como ves/i,
            /esta bien/i,
            /como model/i,
            /como estructur/i,
            /que es un/i,
            /que es una/i,
            /que significa/i,
            /cual es la diferencia/i,
            /sugieres/i,
            /recomendacion/i
        ];

        // Comandos de acción sobre elementos del diagrama
        const actionPatterns = [
            /\b(agrega|agregar|anade|anadir|crea|crear)\b.*\b(clase|entidad|relacion|atributo|metodo|tabla|interfaz)\b/i,
            /\b(conecta|conectar|relaciona|relacionar)\b/i,
            /\b(elimina|eliminar|quita|quitar|borra|borrar)\b.*\b(clase|entidad|relacion|atributo|metodo|tabla)\b/i,
            /\b(modifica|modificar|cambia|cambiar)\b.*\b(clase|entidad|relacion|atributo|metodo|tabla)\b/i
        ];

        // Términos clave específicos de diseño UML y arquitectura
        const umlKeywords = [
            /\b(diagrama|uml)\b/i,
            /\batributo derivado\b/i,
            /\b(herencia|composicion|agregacion|asociacion)\b/i,
            /\bcardinalidad\b/i,
            /\b(patron|patrones) de diseno\b/i,
            /\bprincipios? solid\b/i
        ];

        return questionPatterns.some(p => p.test(clean)) ||
               actionPatterns.some(p => p.test(clean)) ||
               umlKeywords.some(p => p.test(clean));
    }

    /**
     * Determina si la IA debe responder al mensaje recibido.
     * @param {string} texto Mensaje del usuario
     * @param {boolean} hasPendingProposal Indica si hay una propuesta pendiente para este usuario
     * @returns {boolean}
     */
    shouldRespond(texto, hasPendingProposal = false) {
        if (!texto || typeof texto !== 'string') return false;

        // 1. Si hay propuesta pendiente y el mensaje es afirmativo -> true
        if (hasPendingProposal && this._isAffirmative(texto)) {
            return true;
        }

        // 2. Mención explícita a la IA -> true
        if (this._hasAIMention(texto)) {
            return true;
        }

        // 3. Consulta técnica o de diseño UML -> true
        if (this._isTechnicalQuery(texto)) {
            return true;
        }

        // 4. Mensajes casuales entre humanos -> false
        return false;
    }

    /**
     * Genera una respuesta pedagógica de respaldo si OpenAI no está configurado o falla la conexión.
     * @param {string} userName 
     * @param {string} texto 
     * @returns {Object}
     */
    /**
     * Normaliza y preserva los elementos y conexiones del diagrama actual
     * asegurando que ninguna relación existente se pierda y que las nuevas
     * relaciones resuelvan correctamente los identificadores de clases.
     * @param {Object} currentDiagram
     * @param {Object} proposedDiagram
     * @returns {Object} Diagrama normalizado { elements: Array, connections: Array }
     */
    normalizeAndPreserveDiagram(currentDiagram, proposedDiagram) {
        currentDiagram = currentDiagram || {};
        proposedDiagram = proposedDiagram || {};

        // 1. Extraer elementos existentes
        const currentElements = Array.isArray(currentDiagram.elements)
            ? [...currentDiagram.elements]
            : (currentDiagram.elements && typeof currentDiagram.elements === 'object')
                ? Object.values(currentDiagram.elements)
                : [];

        // 2. Extraer elementos propuestos
        const proposedElements = Array.isArray(proposedDiagram.elements)
            ? [...proposedDiagram.elements]
            : (proposedDiagram.elements && typeof proposedDiagram.elements === 'object')
                ? Object.values(proposedDiagram.elements)
                : [];

        // Mapa de elementos por id y por nombre en minúsculas
        const elementsById = new Map();
        const elementsByName = new Map();

        currentElements.forEach(el => {
            if (el && (el.id || el.name)) {
                const id = el.id || `element_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
                const item = { ...el, id };
                elementsById.set(id, item);
                if (item.name) elementsByName.set(String(item.name).trim().toLowerCase(), id);
            }
        });

        // Fusionar elementos propuestos
        proposedElements.forEach(propEl => {
            if (!propEl) return;
            const propName = propEl.name ? String(propEl.name).trim() : '';
            const existingIdByName = propName ? elementsByName.get(propName.toLowerCase()) : null;
            const existingId = propEl.id && elementsById.has(propEl.id) ? propEl.id : existingIdByName;

            if (existingId) {
                const prev = elementsById.get(existingId);
                const updated = {
                    ...prev,
                    ...propEl,
                    id: existingId,
                    x: propEl.x !== undefined ? propEl.x : prev.x,
                    y: propEl.y !== undefined ? propEl.y : prev.y
                };
                elementsById.set(existingId, updated);
            } else {
                const newId = propEl.id || `element_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
                const newEl = {
                    id: newId,
                    type: propEl.type || 'class',
                    name: propEl.name || 'NuevaClase',
                    x: propEl.x !== undefined ? propEl.x : Math.floor(100 + Math.random() * 250),
                    y: propEl.y !== undefined ? propEl.y : Math.floor(100 + Math.random() * 250),
                    attributes: Array.isArray(propEl.attributes) ? propEl.attributes : [],
                    methods: Array.isArray(propEl.methods) ? propEl.methods : []
                };
                elementsById.set(newId, newEl);
                if (newEl.name) elementsByName.set(String(newEl.name).trim().toLowerCase(), newId);
            }
        });

        const finalElements = Array.from(elementsById.values());

        // Función para resolver identificador de clase (nombre o id) a su element_id
        const resolveElementId = (val) => {
            if (!val) return null;
            const strVal = String(val).trim();
            if (elementsById.has(strVal)) return strVal;
            const lower = strVal.toLowerCase();
            if (elementsByName.has(lower)) return elementsByName.get(lower);
            return strVal;
        };

        // 3. Extraer conexiones existentes (acepta connections o relationships)
        const currentConns = Array.isArray(currentDiagram.connections)
            ? currentDiagram.connections
            : Array.isArray(currentDiagram.relationships)
                ? currentDiagram.relationships
                : [];

        // 4. Extraer conexiones propuestas
        const proposedConns = Array.isArray(proposedDiagram.connections)
            ? proposedDiagram.connections
            : Array.isArray(proposedDiagram.relationships)
                ? proposedDiagram.relationships
                : [];

        const connectionsMap = new Map();

        // Preservar todas las conexiones existentes
        currentConns.forEach((conn, index) => {
            if (!conn) return;
            const sourceId = resolveElementId(conn.source);
            const targetId = resolveElementId(conn.target);
            if (!sourceId || !targetId) return;

            const connId = conn.id || `conn_${Date.now()}_${index}`;
            const key = `${sourceId}_${targetId}_${conn.type || 'association'}`;
            connectionsMap.set(key, {
                id: connId,
                source: sourceId,
                target: targetId,
                type: conn.type || 'association',
                sourceMultiplicity: conn.sourceMultiplicity || '',
                targetMultiplicity: conn.targetMultiplicity || '',
                label: conn.label || ''
            });
        });

        // Añadir y fusionar conexiones propuestas
        proposedConns.forEach((conn, index) => {
            if (!conn) return;
            const sourceId = resolveElementId(conn.source);
            const targetId = resolveElementId(conn.target);
            if (!sourceId || !targetId) return;

            const key = `${sourceId}_${targetId}_${conn.type || 'association'}`;
            const existing = connectionsMap.get(key);

            const connId = (existing && existing.id) || conn.id || `conn_${Date.now()}_${index}`;
            connectionsMap.set(key, {
                id: connId,
                source: sourceId,
                target: targetId,
                type: conn.type || (existing ? existing.type : 'association'),
                sourceMultiplicity: conn.sourceMultiplicity || (existing ? existing.sourceMultiplicity : ''),
                targetMultiplicity: conn.targetMultiplicity || (existing ? existing.targetMultiplicity : ''),
                label: conn.label || (existing ? existing.label : '')
            });
        });

        const finalConnections = Array.from(connectionsMap.values());

        return {
            elements: finalElements,
            connections: finalConnections
        };
    }

    _generateLocalFallback(userName, texto) {
        const lower = texto.toLowerCase();
        if (lower.includes('derivado')) {
            return {
                type: 'mentoring',
                textResponse: `Hola ${userName}, un atributo derivado en UML es aquel cuyo valor se puede deducir o calcular a partir de otros atributos o elementos (por ejemplo, la edad calculada a partir de fechaNacimiento). En el diagrama se representa anteponiendo una barra inclinada (/) al nombre del atributo.`,
                hasProposal: false,
                proposal: null
            };
        }

        return {
            type: 'mentoring',
            textResponse: `Hola ${userName}, como compañero del equipo de diseño te sugiero revisar las responsabilidades de las clases y mantener una alta cohesión y bajo acoplamiento según los principios SOLID.`,
            hasProposal: false,
            proposal: null
        };
    }

    /**
     * Procesa un mensaje dentro del contexto de la sala colaborativa.
     * @param {Object} params
     * @param {string} params.salaId Identificador de la sala
     * @param {Object} params.usuario Información del usuario { id, name|username }
     * @param {string} params.texto Mensaje enviado
     * @param {Object} [params.currentDiagram] Diagrama actual en la pizarra
     * @returns {Promise<Object>} Resultado con shouldReply, textResponse, hasDiagramAction, updatedDiagram, proposal
     */
    async processMessage({ salaId, usuario, texto, currentDiagram = null }) {
        const userName = (usuario && (usuario.name || usuario.username)) ? (usuario.name || usuario.username) : 'Colega';
        const userId = (usuario && (usuario.id || usuario.userId)) ? (usuario.id || usuario.userId) : 'unknown';

        // 1. Verificar si existe una propuesta pendiente para este usuario en la sala
        const pendingProposal = this.roomContextManager.getPendingProposal(salaId, userId);
        const hasPendingProposal = Boolean(pendingProposal);

        // 2. Caso de confirmación afirmativa de una propuesta existente
        if (hasPendingProposal && this._isAffirmative(texto)) {
            const updatedDiagram = pendingProposal.updatedDiagram || pendingProposal;
            this.roomContextManager.clearPendingProposal(salaId, userId);
            this.roomContextManager.updateDiagram(salaId, updatedDiagram);

            const textResponse = `Listo ${userName}, he aplicado los cambios acordados en la pizarra.`;
            this.roomContextManager.recordUserQuery(salaId, userId, texto, textResponse);

            return {
                shouldReply: true,
                textResponse,
                hasDiagramAction: true,
                updatedDiagram,
                proposal: null
            };
        }

        // 3. Caso general: evaluar si se debe responder al mensaje
        if (!this.shouldRespond(texto, false)) {
            return { shouldReply: false };
        }

        // 4. Sincronizar contexto y diagrama activo
        if (currentDiagram) {
            this.roomContextManager.updateDiagram(salaId, currentDiagram);
        }
        const activeDiagram = currentDiagram || this.roomContextManager.getDiagram(salaId) || { elements: [], connections: [] };
        const recentMessages = this.roomContextManager.getRecentMessages(salaId, 15);
        const userContext = this.roomContextManager.getUserContext(salaId, userId);

        // 5. Construir prompt y consultar modelo de IA
        const systemPrompt = `Eres un compañero de equipo de desarrollo y Arquitecto de Software experto en diseño UML y principios SOLID.
Estás colaborando en tiempo real con desarrolladores en una sesión de modelado UML en una pizarra compartida.
El desarrollador actual con el que interactúas se llama "${userName}". Dirígete a él o ella cordialmente por su nombre.

ROL Y COMPORTAMIENTO:
1. Actúa como un colega técnico y mentor empático.
2. Si la consulta es conceptual o pedagógica (ej. qué es un atributo derivado, cómo aplicar un patrón o principio SOLID, diferencias de relaciones UML):
   - Explica el concepto con claridad, brevedad y ejemplos prácticos.
   - Responde con "hasProposal": false y "proposal": null.
3. Si el usuario te pide modificar, agregar, conectar o estructurar elementos en el diagrama:
   - Propon los cambios respetando las clases y relaciones existentes en la pizarra.
   - En tu respuesta textual explica la propuesta y formula SIEMPRE la pregunta de confirmación: "¿Quieres que lo aplique en la pizarra?".
   - En el campo "proposal" incluye el resumen de cambios y el objeto "updatedDiagram" completo.
   - Responde con "hasProposal": true.

ESTADO ACTUAL DE LA PIZARRA:
- Diagrama actual: ${JSON.stringify(activeDiagram)}
- Últimos mensajes del equipo: ${JSON.stringify(recentMessages.slice(-5))}
- Contexto previo de ${userName}: ${JSON.stringify(userContext.queries.slice(-3))}

RESPONDE ÚNICAMENTE CON UN OBJETO JSON VÁLIDO CON ESTE ESQUEMA:
{
    "type": "mentoring" | "proposal",
    "textResponse": "Explicación o propuesta para ${userName}...",
    "hasProposal": boolean,
    "proposal": {
        "changes": "Descripción concisa de cambios",
        "updatedDiagram": {
            "elements": [...],
            "relationships": [...]
        }
    } | null
}`;

        let parsed = null;

        if (this.openai) {
            let rawContent = '';
            try {
                const completion = await this.openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: `Mensaje de ${userName}: "${texto}"` }
                    ],
                    temperature: 0.3,
                    response_format: { type: "json_object" }
                });
                rawContent = completion.choices[0]?.message?.content || '';
            } catch (err) {
                // Fallback secundario a gpt-4o si gpt-4o-mini presenta fallas
                try {
                    const fallbackCompletion = await this.openai.chat.completions.create({
                        model: "gpt-4o",
                        messages: [
                            { role: "system", content: systemPrompt },
                            { role: "user", content: `Mensaje de ${userName}: "${texto}"` }
                        ],
                        temperature: 0.3,
                        response_format: { type: "json_object" }
                    });
                    rawContent = fallbackCompletion.choices[0]?.message?.content || '';
                } catch (fallbackErr) {
                    rawContent = '';
                }
            }

            if (rawContent) {
                try {
                    parsed = JSON.parse(rawContent);
                } catch (e) {
                    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        try {
                            parsed = JSON.parse(jsonMatch[0]);
                        } catch {}
                    }
                    if (!parsed) {
                        parsed = {
                            type: "mentoring",
                            textResponse: rawContent,
                            hasProposal: false,
                            proposal: null
                        };
                    }
                }
            }
        }

        // Si OpenAI no está disponible o no devolvió resultado, utilizar fallback local
        if (!parsed) {
            parsed = this._generateLocalFallback(userName, texto);
        }

        const hasProposal = Boolean(parsed.hasProposal || parsed.proposal || parsed.type === 'proposal');
        let textResponse = parsed.textResponse || parsed.message || '';

        // Asegurar trato personalizado dirigiéndose por el nombre
        if (userName && !textResponse.includes(userName)) {
            textResponse = `Hola ${userName}, ${textResponse}`;
        }

        // Si propone modificaciones estructurales al diagrama
        if (hasProposal && (parsed.proposal || parsed.updatedDiagram)) {
            const proposal = parsed.proposal || {
                changes: parsed.changes || 'Propuesta de actualización de clases y relaciones',
                updatedDiagram: parsed.updatedDiagram || activeDiagram
            };

            if (!textResponse.includes('¿Quieres que lo aplique en la pizarra?')) {
                textResponse = `${textResponse.trim()} ¿Quieres que lo aplique en la pizarra?`;
            }

            this.roomContextManager.setPendingProposal(salaId, userId, proposal);
            this.roomContextManager.recordUserQuery(salaId, userId, texto, textResponse);

            return {
                shouldReply: true,
                textResponse,
                hasDiagramAction: false,
                updatedDiagram: null,
                proposal
            };
        }

        // Respuesta explicativa / de mentoría (sin acción sobre el diagrama)
        this.roomContextManager.recordUserQuery(salaId, userId, texto, textResponse);

        return {
            shouldReply: true,
            textResponse,
            hasDiagramAction: false,
            updatedDiagram: null,
            proposal: null
        };
    }

    static get defaultInstance() {
        if (!TeamMemberAIAgent._defaultInstance) {
            TeamMemberAIAgent._defaultInstance = new TeamMemberAIAgent();
        }
        return TeamMemberAIAgent._defaultInstance;
    }

    static shouldRespond(texto, hasPendingProposal = false) {
        return TeamMemberAIAgent.defaultInstance.shouldRespond(texto, hasPendingProposal);
    }

    static async processMessage(params) {
        return TeamMemberAIAgent.defaultInstance.processMessage(params);
    }
}

export default TeamMemberAIAgent;

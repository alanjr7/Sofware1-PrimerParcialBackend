import BaseAgent from './BaseAgent.js';
import OpenAI from 'openai';

/**
 * DiagramCopilotAgent - Agente Inteligente para Asistencia, Creación e Incremento de Diagramas UML
 * Capaz de recibir el estado actual del lienzo (contexto) y aplicar operaciones incrementales (ADD, UPDATE, CONNECT).
 */
export class DiagramCopilotAgent extends BaseAgent {
    constructor() {
        super(
            'DiagramCopilotAgent',
            'Copiloto y Diseñador UML Incremental',
            'Genera, amplía, modifica y conecta diagramas de clases UML preservando el estado previo del lienzo.'
        );

        this.openai = null;
        if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here') {
            this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        }
    }

    /**
     * Procesa la solicitud del usuario de forma contextual e incremental
     * @param {string} userInput Instrucción del usuario (ej: "crea una relación de notificación a servicio")
     * @param {Object} currentDiagram { elements: Array, relationships: Array } Estado actual de la pizarra
     */
    async execute(userInput, currentDiagram = {}) {
        if (!this.openai) {
            throw new Error("OpenAI API Key no está configurada en el servidor.");
        }

        const existingElements = Array.isArray(currentDiagram.elements) ? currentDiagram.elements : [];
        const existingRelationships = Array.isArray(currentDiagram.relationships) ? currentDiagram.relationships : [];

        const systemPrompt = `Eres un Arquitecto de Software y Diseñador experto en diagramas UML de clases.
Tu tarea es responder a la solicitud del usuario modificando o ampliando el diagrama UML actual de forma INTELIGENTE e INCREMENTAL.

CONTEXTO DEL DIAGRAMA ACTUAL EN LA PIZARRA:
- Elementos existentes (${existingElements.length}):
${JSON.stringify(existingElements.map(e => ({ id: e.id, name: e.name, attributes: (e.attributes || []).map(a => a.name), methods: (e.methods || []).map(m => m.name) })), null, 2)}
- Relaciones existentes (${existingRelationships.length}):
${JSON.stringify(existingRelationships.map(r => ({ id: r.id, type: r.type, source: r.sourceId || r.source, target: r.targetId || r.target, cardinality: r.cardinality })), null, 2)}

INSTRUCCIONES CLAVE:
1. NUNCA borres clases existentes a menos que el usuario lo pida explícitamente ("elimina la clase X", "reinicia todo el diagrama").
2. Si el usuario pide agregar una relación o conectar entidades (ej: "conecta Notificacion con Servicio"):
   - Si las clases existen, REUTILIZA exactamente sus IDs y nombres.
   - Si alguna de las clases mencionadas no existe en el diagrama actual, CRÉALA con atributos y métodos coherentes y luego crea la relación.
3. Si el usuario pide crear nuevas clases o módulos, agrégalas distribuyéndolas en posiciones con offset adecuado (evita superponer clases).
4. Si el usuario pide modificar o añadir atributos/métodos a una clase existente, preserva su ID original y añade lo solicitado.
5. Devuelve la propiedad "isReset": true ÚNICAMENTE si el usuario pide borrar/reiniciar el diagrama completo. Por defecto "isReset" debe ser false.

RESPONDE ÚNICAMENTE CON UN OBJETO JSON VÁLIDO (sin markdown, sin bloques \`\`\`json, sin texto extra):
{
    "isReset": false,
    "message": "Mensaje conciso explicando qué se agregó o modificó",
    "elements": [
        {
            "id": "id_existente_o_nuevo",
            "type": "class",
            "name": "NombreClase",
            "attributes": [
                { "name": "id", "type": "int", "visibility": "private", "isPrimaryKey": true },
                { "name": "campo", "type": "string", "visibility": "private", "isPrimaryKey": false }
            ],
            "methods": [
                { "name": "ejecutar", "returnType": "void", "parameters": [], "visibility": "public" }
            ],
            "position": { "x": 100, "y": 100 }
        }
    ],
    "relationships": [
        {
            "id": "rel_id",
            "type": "association|inheritance|composition|aggregation|dependency",
            "sourceId": "id_or_name_origen",
            "targetId": "id_or_name_destino",
            "cardinality": "1:*",
            "label": ""
        }
    ]
}`;

        const userPrompt = `Solicitud del usuario: "${userInput}"
Diagrama actual tiene ${existingElements.length} elementos. Aplica la acción requerida de forma coherente.`;

        const completion = await this.openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.3,
            max_tokens: 2500
        });

        const rawContent = completion.choices[0].message.content.trim();
        let parsedResult;

        try {
            parsedResult = JSON.parse(rawContent);
        } catch {
            const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsedResult = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error("La respuesta del Agente no contiene un formato JSON válido.");
            }
        }

        return parsedResult;
    }
}

export default DiagramCopilotAgent;

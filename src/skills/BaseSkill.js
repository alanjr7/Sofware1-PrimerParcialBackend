/**
 * BaseSkill - Interfaz / Clase base abstracta para Skills del Agente de Arquitectura
 */
export class BaseSkill {
    constructor(name, description, category, icon = 'fa-cogs') {
        if (new.target === BaseSkill) {
            throw new TypeError("No se puede instanciar directamente la clase abstracta BaseSkill.");
        }
        this.name = name;
        this.description = description;
        this.category = category; // 'uml' | 'solid' | 'persistence' | 'patcher'
        this.icon = icon;
    }

    /**
     * Ejecuta el análisis de la habilidad sobre los datos del diagrama
     * @param {Object} diagramData { elements: Array, relationships: Array }
     * @param {Object} context Contexto adicional (salaId, prompt opcional, etc.)
     * @returns {Promise<Array>} Lista de hallazgos o sugerencias estructuradas
     */
    async execute(diagramData, context = {}) {
        throw new Error("El método execute() debe ser implementado por la subclase.");
    }
}

export default BaseSkill;

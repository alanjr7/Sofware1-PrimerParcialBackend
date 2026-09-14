/**
 * BaseAgent - Clase base para la arquitectura de Agentes Inteligentes
 */
export class BaseAgent {
    constructor(name, role, description) {
        if (new.target === BaseAgent) {
            throw new TypeError("No se puede instanciar directamente la clase abstracta BaseAgent.");
        }
        this.name = name;
        this.role = role;
        this.description = description;
        this.skills = new Map();
    }

    /**
     * Registra una habilidad en el agente
     * @param {BaseSkill} skill Instancia de una habilidad
     */
    registerSkill(skill) {
        if (!skill || !skill.name) {
            throw new Error("La habilidad debe ser una instancia válida con propiedad 'name'.");
        }
        this.skills.set(skill.name, skill);
        return this;
    }

    /**
     * Obtiene una habilidad por nombre
     * @param {string} skillName 
     */
    getSkill(skillName) {
        return this.skills.get(skillName);
    }

    /**
     * Ejecuta una habilidad específica
     */
    async runSkill(skillName, data, context = {}) {
        const skill = this.skills.get(skillName);
        if (!skill) {
            throw new Error(`La habilidad '${skillName}' no está registrada en el agente '${this.name}'.`);
        }
        return await skill.execute(data, context);
    }

    /**
     * Ejecución principal del agente
     */
    async execute(input, context = {}) {
        throw new Error("El método execute() debe ser implementado por la subclase del Agente.");
    }
}

export default BaseAgent;

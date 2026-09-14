import BaseAgent from './BaseAgent.js';
import UMLConsistencySkill from '../skills/UMLConsistencySkill.js';
import SolidDesignSkill from '../skills/SolidDesignSkill.js';
import PersistenceModelSkill from '../skills/PersistenceModelSkill.js';
import CanvasPatcherSkill from '../skills/CanvasPatcherSkill.js';
import OpenAI from 'openai';

/**
 * ArchitectureReviewAgent - Agente Orquestador de Calidad Arquitectónica y Diseño UML
 */
export class ArchitectureReviewAgent extends BaseAgent {
    constructor() {
        super(
            'ArchitectureReviewAgent',
            'Arquitecto de Software & Auditor de Diagramas UML',
            'Orquesta habilidades especializadas para auditar consistencia UML, principios SOLID, persistencia de datos y genera parches de mejora interactivos.'
        );

        // Inicializar cliente OpenAI si hay API Key disponible
        this.openai = null;
        if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here') {
            this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        }

        // Registrar ecosistema de Skills
        this.registerSkill(new UMLConsistencySkill());
        this.registerSkill(new SolidDesignSkill());
        this.registerSkill(new PersistenceModelSkill());
        this.registerSkill(new CanvasPatcherSkill());
    }

    /**
     * Ejecuta el pipeline completo de auditoría multi-skill sobre el diagrama
     * @param {Object} diagramData { elements: Array, relationships: Array }
     * @param {Object} context { salaId, userMessage }
     */
    async execute(diagramData = {}, context = {}) {
        const startTime = Date.now();

        // Normalizar elements (Array o Diccionario)
        let elements = [];
        if (Array.isArray(diagramData.elements)) {
            elements = diagramData.elements;
        } else if (diagramData.elements && typeof diagramData.elements === 'object') {
            elements = Object.values(diagramData.elements);
        }

        // Normalizar relationships (relationships o connections, Array o Diccionario)
        let relationships = [];
        if (Array.isArray(diagramData.relationships)) {
            relationships = diagramData.relationships;
        } else if (Array.isArray(diagramData.connections)) {
            relationships = diagramData.connections;
        } else if (diagramData.relationships && typeof diagramData.relationships === 'object') {
            relationships = Object.values(diagramData.relationships);
        }

        const normalizedDiagram = { elements, relationships };

        // Si el diagrama está completamente vacío
        if (elements.length === 0) {
            return {
                agent: this.name,
                role: this.role,
                summary: "El lienzo está actualmente vacío. Agrega clases o describe el sistema que deseas diseñar para que las habilidades de auditoría puedan evaluarlo.",
                stats: { totalElements: 0, totalRelationships: 0, totalFindings: 0 },
                skillsExecuted: Array.from(this.skills.keys()),
                suggestions: []
            };
        }

        // 1. Ejecutar Skills de Análisis en paralelo
        const [umlFindings, solidFindings, persistenceFindings] = await Promise.all([
            this.runSkill('UMLConsistencySkill', normalizedDiagram, context),
            this.runSkill('SolidDesignSkill', normalizedDiagram, context),
            this.runSkill('PersistenceModelSkill', normalizedDiagram, context)
        ]);

        let allFindings = [
            ...umlFindings,
            ...solidFindings,
            ...persistenceFindings
        ];

        // 2. Si OpenAI está configurado, enriquecer con análisis semántico profundo
        if (this.openai && elements.length > 0) {
            try {
                const llmExtraSuggestions = await this.queryLLMDeepReview(diagramData, context);
                if (Array.isArray(llmExtraSuggestions) && llmExtraSuggestions.length > 0) {
                    allFindings = [...allFindings, ...llmExtraSuggestions];
                }
            } catch (err) {
                console.warn('⚠️ ArchitectureReviewAgent LLM enrichment failed, using skill-based heuristics:', err.message);
            }
        }

        // 3. Ejecutar CanvasPatcherSkill para empaquetar hallazgos en parches atómicos
        const actionableSuggestions = await this.runSkill('CanvasPatcherSkill', allFindings, context);

        const executionDuration = Date.now() - startTime;

        // 4. Generar resumen ejecutivo
        const totalFindings = actionableSuggestions.length;
        let summary = '';
        if (totalFindings === 0) {
            summary = '✨ ¡Excelente trabajo arquitectónico! El diagrama cumple con las buenas prácticas de diseño, principios SOLID y consistencia UML.';
        } else {
            const errorCount = actionableSuggestions.filter(s => s.severity === 'error').length;
            const warningCount = actionableSuggestions.filter(s => s.severity === 'warning').length;
            const infoCount = actionableSuggestions.filter(s => s.severity === 'info').length;

            summary = `Auditoría completada en ${executionDuration}ms por el Agente de Arquitectura. Se detectaron ${totalFindings} hallazgos (${errorCount} errores críticos, ${warningCount} advertencias, ${infoCount} sugerencias). Revisa las tarjetas a continuación para autorizar o descartar cada mejora.`;
        }

        return {
            agent: this.name,
            role: this.role,
            summary: summary,
            stats: {
                totalElements: elements.length,
                totalRelationships: relationships.length,
                totalFindings: totalFindings,
                durationMs: executionDuration
            },
            skillsExecuted: [
                { name: 'UMLConsistencySkill', icon: 'fa-ruler-combined', findingsCount: umlFindings.length },
                { name: 'SolidDesignSkill', icon: 'fa-cubes', findingsCount: solidFindings.length },
                { name: 'PersistenceModelSkill', icon: 'fa-database', findingsCount: persistenceFindings.length },
                { name: 'CanvasPatcherSkill', icon: 'fa-wrench', findingsCount: actionableSuggestions.length }
            ],
            suggestions: actionableSuggestions
        };
    }

    /**
     * Consulta opcional a OpenAI para análisis de alto nivel de dominio
     */
    async queryLLMDeepReview(diagramData, context) {
        const prompt = `Analiza este diagrama de clases UML y sugiere mejoras de patrones de diseño (GoF) o arquitecturas limpias:\n${JSON.stringify(diagramData, null, 2)}`;
        
        const response = await this.openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "Eres un arquitecto de software experto. Responde ÚNICAMENTE con un arreglo JSON de objetos con formato: [ { skill: 'SolidDesignSkill', category: 'solid', severity: 'info', title: 'Título', description: 'Explicación concisa', targetElementId: 'id', targetElementName: 'Nombre', actionType: 'generic', proposedFix: {} } ]"
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.2
        });

        try {
            return JSON.parse(response.choices[0].message.content.trim());
        } catch {
            return [];
        }
    }
}

export default ArchitectureReviewAgent;

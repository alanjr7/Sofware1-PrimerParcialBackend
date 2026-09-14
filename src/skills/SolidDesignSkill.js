import BaseSkill from './BaseSkill.js';

/**
 * SolidDesignSkill - Audita principios SOLID (SRP, OCP, LSP, ISP, DIP), Clean Architecture y separación de capas
 */
export class SolidDesignSkill extends BaseSkill {
    constructor() {
        super(
            'SolidDesignSkill',
            'Audita principios SOLID, Clean Architecture, separación de capas y acoplamiento/cohesión.',
            'solid',
            'fa-cubes'
        );
    }

    async execute(diagramData, context = {}) {
        const findings = [];
        const { elements = [], relationships = [] } = diagramData;

        elements.forEach(el => {
            if (el.type === 'class' || !el.type) {
                const attrs = el.attributes || [];
                const methods = el.methods || [];
                const totalMembers = attrs.length + methods.length;
                const isEntity = (el.stereotype || '').toLowerCase().includes('entidad') || !el.stereotype;

                // 1. Antipatrón God Class Real (Umbral profesional: 20+ miembros o 10+ métodos)
                if (totalMembers >= 20 || methods.length >= 10) {
                    findings.push({
                        skill: this.name,
                        category: this.category,
                        severity: 'warning',
                        title: `Antipatrón God Class / Violación de SRP en '${el.name}'`,
                        description: `La clase '${el.name}' acumula ${attrs.length} atributos y ${methods.length} métodos (${totalMembers} miembros en total). Se aconseja dividir responsabilidades aplicando Alta Cohesión.`,
                        targetElementId: el.id,
                        targetElementName: el.name,
                        actionType: 'suggest_refactoring',
                        proposedFix: {
                            classId: el.id,
                            className: el.name,
                            recommendation: `Extraer lógica de negocio o servicios auxiliares a una clase o servicio especializado.`
                        }
                    });
                }

                // 2. Violación de Clean Architecture / SRP en Entidades (Lógica de Casos de Uso / Seguridad en Entidades)
                if (isEntity) {
                    const securityAndAuthMethods = methods.filter(m => {
                        const mName = m.name.toLowerCase();
                        return mName.includes('iniciarsesion') || 
                               mName.includes('login') || 
                               mName.includes('recuperarcontrasena') || 
                               mName.includes('cambiarcontrasena') ||
                               mName.includes('autenticar');
                    });

                    if (securityAndAuthMethods.length > 0) {
                        const methodNames = securityAndAuthMethods.map(m => `'${m.name}()'`).join(', ');
                        findings.push({
                            skill: this.name,
                            category: this.category,
                            severity: 'warning',
                            title: `Violación de Clean Architecture / SRP en '${el.name}' (Lógica de Autenticación)`,
                            description: `La entidad '${el.name}' contiene métodos de seguridad y autenticación (${methodNames}). En Clean Architecture y DDD, la autenticación y gestión de credenciales pertenece a la Capa de Servicios/Casos de Uso ('AuthService' / 'SecurityService'), no a la entidad de datos.`,
                            targetElementId: el.id,
                            targetElementName: el.name,
                            actionType: 'extract_auth_service',
                            proposedFix: {
                                classId: el.id,
                                className: el.name,
                                suggestedService: 'AuthService',
                                methodsToExtract: securityAndAuthMethods.map(m => m.name)
                            }
                        });
                    }

                    // Métodos de tipo "gestionar" o CRUD administrativo en Entidades de Usuario
                    const administrativeManagementMethods = methods.filter(m => {
                        const mName = m.name.toLowerCase();
                        return mName.startsWith('gestionar') || mName.startsWith('administrar') || mName.startsWith('configurar');
                    });

                    if (administrativeManagementMethods.length > 0) {
                        const methodNames = administrativeManagementMethods.map(m => `'${m.name}()'`).join(', ');
                        findings.push({
                            skill: this.name,
                            category: this.category,
                            severity: 'warning',
                            title: `Confusión de Roles de Capa en '${el.name}' (Métodos de Gestión)`,
                            description: `La entidad '${el.name}' tiene métodos de gestión global (${methodNames}). En diseño orientado a objetos riguroso, los procesos administrativos y CRUDs son orquestados por un Servicio de Aplicación (ej. 'AdminService'), no por el objeto de modelo.`,
                            targetElementId: el.id,
                            targetElementName: el.name,
                            actionType: 'extract_admin_service',
                            proposedFix: {
                                classId: el.id,
                                className: el.name,
                                suggestedService: 'AdminService',
                                methodsToExtract: administrativeManagementMethods.map(m => m.name)
                            }
                        });
                    }
                }

                // 3. Principio de Segregación de Interfaces (ISP) en Servicios Sobrecargados (ej: AsistenteIA)
                const stereo = (el.stereotype || '').toLowerCase();
                const isFacadeOrSegregated = stereo.includes('fachada') || stereo.includes('facade') || stereo.includes('interface');
                const isService = (stereo.includes('servicio') || el.name.toLowerCase().includes('asistente') || el.name.toLowerCase().includes('service')) && !isFacadeOrSegregated;

                if (isService && methods.length >= 6) {
                    findings.push({
                        skill: this.name,
                        category: this.category,
                        severity: 'info',
                        title: `Oportunidad de Segregación de Interfaces (ISP) o Patrón Fachada en '${el.name}'`,
                        description: `El servicio '${el.name}' implementa ${methods.length} métodos con responsabilidades diversas. Se recomienda aplicar el Principio de Segregación de Interfaces (ISP) o formalizarlo como Patrón Fachada (<<Fachada>>) para orquestar los subsistemas.`,
                        targetElementId: el.id,
                        targetElementName: el.name,
                        actionType: 'apply_facade_pattern',
                        proposedFix: {
                            classId: el.id,
                            className: el.name,
                            newStereotype: 'Fachada'
                        }
                    });
                }
            }
        });

        // 4. Clases aisladas (Sin relaciones en el lienzo pero posiblemente referenciadas)
        if (elements.length > 1) {
            elements.forEach(el => {
                if (el.type === 'class') {
                    const hasRelation = relationships.some(r => r.sourceId === el.id || r.targetId === el.id || r.sourceId === el.name || r.targetId === el.name);
                    if (!hasRelation) {
                        // Buscar si otra clase la menciona como tipo de retorno o parámetro
                        let referencedBy = [];
                        elements.forEach(other => {
                            if (other.id !== el.id) {
                                (other.methods || []).forEach(m => {
                                    if (m.returnType === el.name || (m.parameters || []).some(p => p.type === el.name)) {
                                        referencedBy.push(other.name);
                                    }
                                });
                            }
                        });

                        if (referencedBy.length > 0) {
                            const sources = Array.from(new Set(referencedBy)).join(', ');
                            findings.push({
                                skill: this.name,
                                category: this.category,
                                severity: 'warning',
                                title: `Falta relación de Dependencia para '${el.name}'`,
                                description: `La clase '${el.name}' es utilizada en métodos de '${sources}', pero no tiene una flecha de dependencia ('<<use>>' o línea discontinua) trazada en el diagrama UML.`,
                                targetElementId: el.id,
                                targetElementName: el.name,
                                actionType: 'add_dependency_relation',
                                proposedFix: {
                                    classId: el.id,
                                    className: el.name,
                                    dependencyFrom: sources,
                                    relationType: 'dependency',
                                    label: '<<use>>'
                                }
                            });
                        } else {
                            findings.push({
                                skill: this.name,
                                category: this.category,
                                severity: 'info',
                                title: `Clase aislada sin relaciones: '${el.name}'`,
                                description: `La clase '${el.name}' no está vinculada con ningún otro componente del modelo de dominio.`,
                                targetElementId: el.id,
                                targetElementName: el.name,
                                actionType: 'generic',
                                proposedFix: {
                                    classId: el.id,
                                    className: el.name
                                }
                            });
                        }
                    }
                }
            });
        }

        return findings;
    }
}

export default SolidDesignSkill;

import BaseSkill from './BaseSkill.js';

/**
 * UMLConsistencySkill - Valida la sintaxis, visibilidades, tipos y consistencia UML 2.5
 */
export class UMLConsistencySkill extends BaseSkill {
    constructor() {
        super(
            'UMLConsistencySkill',
            'Audita la sintaxis formal UML, visibilidades, coherencia de tipos y cardinalidades.',
            'uml',
            'fa-ruler-combined'
        );
    }

    async execute(diagramData, context = {}) {
        const findings = [];
        const { elements = [], relationships = [] } = diagramData;

        // 1. Validar elementos / Clases
        elements.forEach(el => {
            if (el.type === 'class' || !el.type) {
                // Verificar nombre de clase (PascalCase)
                if (el.name && !/^[A-Z][a-zA-Z0-9_]*$/.test(el.name)) {
                    findings.push({
                        skill: this.name,
                        category: this.category,
                        severity: 'warning',
                        title: `Nomenclatura no estándar en clase '${el.name}'`,
                        description: `Por convención UML y Clean Code, los nombres de clases deben estar en PascalCase (iniciar con mayúscula). Se sugiere renombrar a '${el.name.charAt(0).toUpperCase() + el.name.slice(1)}'.`,
                        targetElementId: el.id,
                        targetElementName: el.name,
                        actionType: 'rename_class',
                        proposedFix: {
                            newName: el.name.charAt(0).toUpperCase() + el.name.slice(1)
                        }
                    });
                }

                // Verificar si tiene atributos o métodos
                const hasAttrs = Array.isArray(el.attributes) && el.attributes.length > 0;
                const hasMethods = Array.isArray(el.methods) && el.methods.length > 0;

                if (!hasAttrs && !hasMethods) {
                    findings.push({
                        skill: this.name,
                        category: this.category,
                        severity: 'info',
                        title: `Clase vacía '${el.name}'`,
                        description: `La clase '${el.name}' no tiene atributos ni métodos declarados. Considera definir su estructura básica.`,
                        targetElementId: el.id,
                        targetElementName: el.name,
                        actionType: 'suggest_scaffold',
                        proposedFix: {
                            defaultAttributes: [
                                { name: "id", type: "Long", visibility: "private", isPrimaryKey: true },
                                { name: "estado", type: "String", visibility: "private", isPrimaryKey: false }
                            ]
                        }
                    });
                }

                // Verificar tipos no especificados o 'any' en atributos
                if (Array.isArray(el.attributes)) {
                    el.attributes.forEach((attr, idx) => {
                        if (!attr.type || attr.type.toLowerCase() === 'any' || attr.type.trim() === '') {
                            findings.push({
                                skill: this.name,
                                category: this.category,
                                severity: 'warning',
                                title: `Atributo sin tipo en '${el.name}.${attr.name}'`,
                                description: `El atributo '${attr.name}' carece de tipo de dato fuertemente tipado.`,
                                targetElementId: el.id,
                                targetElementName: el.name,
                                actionType: 'fix_attribute_type',
                                proposedFix: {
                                    attributeIndex: idx,
                                    attributeName: attr.name,
                                    suggestedType: 'String'
                                }
                            });
                        }
                    });
                }
            }
        });

        // 2. Validar relaciones y cardinalidades
        const NON_CARDINALITY_RELATIONS = ['inheritance', 'herencia', 'generalization', 'generalizacion', 'realization', 'realizacion', 'implementation'];

        relationships.forEach(rel => {
            const relType = (rel.type || 'association').toLowerCase();

            // En estándar UML 2.5, la herencia / generalización NO lleva cardinalidades
            if (NON_CARDINALITY_RELATIONS.includes(relType)) {
                // Verificar si la clase hija está re-declarando la PK de la clase padre
                const parentClass = elements.find(e => e.id === rel.sourceId || e.name === rel.sourceId);
                const childClass = elements.find(e => e.id === rel.targetId || e.name === rel.targetId);

                if (parentClass && childClass) {
                    const parentPk = (parentClass.attributes || []).find(a => a.isPrimaryKey || a.name.toLowerCase() === 'id');
                    const childPk = (childClass.attributes || []).find(a => a.isPrimaryKey || a.name.toLowerCase() === 'id');

                    if (parentPk && childPk) {
                        findings.push({
                            skill: this.name,
                            category: this.category,
                            severity: 'warning',
                            title: `Redundancia de clave primaria en herencia: '${childClass.name}'`,
                            description: `La clase '${childClass.name}' hereda de '${parentClass.name}'. En POO y mapeo relacional (JPA/ORM), la clave primaria ('${childPk.name}') ya es heredada y no debe re-declararse en la clase hija.`,
                            targetElementId: childClass.id,
                            targetElementName: childClass.name,
                            actionType: 'remove_attribute',
                            proposedFix: {
                                targetClassId: childClass.id,
                                className: childClass.name,
                                attributeName: childPk.name
                            }
                        });
                    }
                }
                return;
            }

            // Relaciones estructurales sin cardinalidad ni multiplicidades explícitas
            const hasAnyMultiplicity = (rel.cardinality && rel.cardinality.trim() !== '' && rel.cardinality !== 'undefined') ||
                                       (rel.sourceMultiplicity && rel.sourceMultiplicity.trim() !== '') ||
                                       (rel.targetMultiplicity && rel.targetMultiplicity.trim() !== '');

            if (!hasAnyMultiplicity) {
                let suggestedCard = '1..*';
                if (relType.includes('one-to-one') || relType === '1:1') suggestedCard = '1..1';
                else if (relType.includes('many-to-one') || relType === '*:1') suggestedCard = '*..1';
                else if (relType.includes('one-to-many') || relType === '1:*') suggestedCard = '1..*';
                else if (relType.includes('many-to-many') || relType === '*:*') suggestedCard = '*..*';

                findings.push({
                    skill: this.name,
                    category: this.category,
                    severity: 'info',
                    title: `Multiplicidad no definida en relación (${rel.type || 'asociación'})`,
                    description: `La relación estructural de tipo '${rel.type || 'asociación'}' no tiene multiplicidad explícita en sus extremos. Se sugiere asignar '${suggestedCard}'.`,
                    targetElementId: rel.id,
                    targetElementName: `Relación ${rel.id}`,
                    actionType: 'set_cardinality',
                    proposedFix: {
                        relationshipId: rel.id,
                        suggestedCardinality: suggestedCard
                    }
                });
            }
        });

        return findings;
    }
}

export default UMLConsistencySkill;

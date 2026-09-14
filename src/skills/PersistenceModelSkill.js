import BaseSkill from './BaseSkill.js';

/**
 * PersistenceModelSkill - Audita la integridad relacional, claves primarias/foráneas y persistencia ORM
 */
export class PersistenceModelSkill extends BaseSkill {
    constructor() {
        super(
            'PersistenceModelSkill',
            'Audita la integridad relacional, claves primarias (PK), foráneas (FK) y compatibilidad con BD / ORM.',
            'persistence',
            'fa-database'
        );
    }

    async execute(diagramData, context = {}) {
        const findings = [];
        const { elements = [], relationships = [] } = diagramData;

        elements.forEach(el => {
            if (el.type === 'class' || !el.type) {
                const stereo = (el.stereotype || '').toLowerCase();
                const isServiceOrInterface = stereo.includes('servicio') || stereo.includes('service') || stereo.includes('interface') || stereo.includes('fachada') || stereo.includes('facade');
                if (isServiceOrInterface) {
                    return; // Los servicios, interfaces y fachadas no representan tablas relacionales y no requieren PK
                }

                const attributes = el.attributes || [];
                
                // 1. Detección de falta de Clave Primaria (PK)
                let hasPrimaryKey = attributes.some(attr => 
                    attr.isPrimaryKey === true || 
                    attr.name.toLowerCase() === 'id' || 
                    attr.name.toLowerCase() === `id${el.name.toLowerCase()}` ||
                    attr.name.toLowerCase() === `id_${el.name.toLowerCase()}`
                );

                // Si no tiene PK propia, verificar si la hereda de una clase padre
                if (!hasPrimaryKey) {
                    const inheritanceRel = relationships.find(r => 
                        (r.type === 'inheritance' || r.type === 'herencia' || r.type === 'generalization') &&
                        (r.targetId === el.id || r.targetId === el.name || r.sourceId === el.id || r.sourceId === el.name)
                    );

                    if (inheritanceRel) {
                        const parentId = (inheritanceRel.sourceId === el.id || inheritanceRel.sourceId === el.name)
                            ? inheritanceRel.targetId
                            : inheritanceRel.sourceId;

                        const parentClass = elements.find(e => e.id === parentId || e.name === parentId);
                        if (parentClass && (parentClass.attributes || []).some(a => a.isPrimaryKey || a.name.toLowerCase() === 'id')) {
                            hasPrimaryKey = true; // La clave primaria se hereda legítimamente de la clase padre
                        }
                    }
                }

                if (!hasPrimaryKey) {
                    const pkName = `id${el.name}`;
                    findings.push({
                        skill: this.name,
                        category: this.category,
                        severity: 'error',
                        title: `Falta Clave Primaria en '${el.name}'`,
                        description: `La entidad '${el.name}' no tiene definido un identificador único (PK) ni lo hereda de una clase padre. Es indispensable para la persistencia en base de datos.`,
                        targetElementId: el.id,
                        targetElementName: el.name,
                        actionType: 'add_primary_key',
                        proposedFix: {
                            classId: el.id,
                            className: el.name,
                            attribute: {
                                name: pkName,
                                type: 'Long',
                                visibility: 'private',
                                isPrimaryKey: true
                            }
                        }
                    });
                }

                // 2. Detección de claves foráneas no explícitas en relaciones de agregación/composición
                const incomingCompositions = relationships.filter(r => 
                    r.targetId === el.id && (r.type === 'composition' || r.type === 'aggregation')
                );

                incomingCompositions.forEach(rel => {
                    const sourceClass = elements.find(e => e.id === rel.sourceId);
                    if (sourceClass) {
                        const expectedFkName = `id${sourceClass.name}`;
                        const hasFk = attributes.some(a => 
                            a.name.toLowerCase() === expectedFkName.toLowerCase() ||
                            a.name.toLowerCase() === `${sourceClass.name.toLowerCase()}id` ||
                            a.name.toLowerCase() === `${sourceClass.name.toLowerCase()}_id`
                        );

                        if (!hasFk) {
                            findings.push({
                                skill: this.name,
                                category: this.category,
                                severity: 'warning',
                                title: `Clave Foránea sugerida en '${el.name}'`,
                                description: `Existe una relación de dependencia desde '${sourceClass.name}' hacia '${el.name}', pero '${el.name}' no declara '${expectedFkName}' (FK).`,
                                targetElementId: el.id,
                                targetElementName: el.name,
                                actionType: 'add_foreign_key',
                                proposedFix: {
                                    classId: el.id,
                                    className: el.name,
                                    attribute: {
                                        name: expectedFkName,
                                        type: 'Long',
                                        visibility: 'private',
                                        isPrimaryKey: false,
                                        isForeignKey: true
                                    }
                                }
                            });
                        }
                    }
                });
            }
        });

        return findings;
    }
}

export default PersistenceModelSkill;

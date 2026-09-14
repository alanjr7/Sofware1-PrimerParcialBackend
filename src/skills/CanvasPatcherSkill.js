import BaseSkill from './BaseSkill.js';

/**
 * CanvasPatcherSkill - Convierte los hallazgos abstractos de las demás skills en parches atómicos ejecutables en el Canvas UML
 */
export class CanvasPatcherSkill extends BaseSkill {
    constructor() {
        super(
            'CanvasPatcherSkill',
            'Genera parches atómicos ejecutables en el DOM y Canvas para el flujo Human-in-the-Loop.',
            'patcher',
            'fa-wrench'
        );
    }

    async execute(findingsList, context = {}) {
        return findingsList.map((finding, index) => {
            const patchId = `patch_${Date.now()}_${index}`;
            let executablePatch = null;

            switch (finding.actionType) {
                case 'add_primary_key':
                case 'add_foreign_key':
                    executablePatch = {
                        type: 'ADD_ATTRIBUTE',
                        targetClassId: finding.targetElementId,
                        attribute: finding.proposedFix.attribute
                    };
                    break;

                case 'rename_class':
                    executablePatch = {
                        type: 'RENAME_CLASS',
                        targetClassId: finding.targetElementId,
                        newName: finding.proposedFix.newName
                    };
                    break;

                case 'set_cardinality':
                    executablePatch = {
                        type: 'SET_CARDINALITY',
                        targetRelationshipId: finding.proposedFix.relationshipId,
                        cardinality: finding.proposedFix.suggestedCardinality
                    };
                    break;

                case 'suggest_scaffold':
                    executablePatch = {
                        type: 'SCAFFOLD_ATTRIBUTES',
                        targetClassId: finding.targetElementId,
                        attributes: finding.proposedFix.defaultAttributes
                    };
                    break;

                case 'fix_attribute_type':
                    executablePatch = {
                        type: 'UPDATE_ATTRIBUTE_TYPE',
                        targetClassId: finding.targetElementId,
                        attributeName: finding.proposedFix.attributeName,
                        newType: finding.proposedFix.suggestedType
                    };
                    break;

                case 'remove_attribute':
                    executablePatch = {
                        type: 'REMOVE_ATTRIBUTE',
                        targetClassId: finding.targetElementId || finding.proposedFix.targetClassId,
                        attributeName: finding.proposedFix.attributeName
                    };
                    break;

                case 'extract_auth_service':
                case 'extract_admin_service':
                    executablePatch = {
                        type: 'EXTRACT_SERVICE_CLASS',
                        sourceClassId: finding.targetElementId,
                        newClassName: finding.proposedFix.suggestedService,
                        methodsToExtract: finding.proposedFix.methodsToExtract
                    };
                    break;

                case 'apply_facade_pattern':
                    executablePatch = {
                        type: 'SET_STEREOTYPE',
                        targetClassId: finding.targetElementId,
                        newStereotype: finding.proposedFix.newStereotype || 'Fachada'
                    };
                    break;

                case 'add_dependency_relation':
                    executablePatch = {
                        type: 'ADD_RELATIONSHIP',
                        sourceId: finding.proposedFix.dependencyFrom,
                        targetId: finding.targetElementId,
                        relationType: finding.proposedFix.relationType || 'dependency',
                        label: finding.proposedFix.label || '<<use>>'
                    };
                    break;

                default:
                    executablePatch = {
                        type: 'GENERIC_ADVICE',
                        targetClassId: finding.targetElementId
                    };
                    break;
            }

            return {
                id: patchId,
                ...finding,
                patch: executablePatch,
                status: 'pending' // 'pending' | 'authorized' | 'rejected'
            };
        });
    }
}

export default CanvasPatcherSkill;

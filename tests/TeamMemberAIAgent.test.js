import test from 'node:test';
import assert from 'node:assert/strict';
import { TeamMemberAIAgent } from '../src/agents/TeamMemberAIAgent.js';
import { RoomContextManager } from '../src/services/RoomContextManager.js';

test('TeamMemberAIAgent - 1. Filtro shouldRespond (descarte casual vs mención y confirmación)', () => {
    const manager = new RoomContextManager();
    const agent = new TeamMemberAIAgent(manager, null);

    // Mensajes casuales entre humanos deben ser descartados (false)
    assert.equal(agent.shouldRespond('hola chicos', false), false);
    assert.equal(agent.shouldRespond('voy por agua', false), false);
    assert.equal(agent.shouldRespond('nos vemos luego', false), false);
    assert.equal(agent.shouldRespond('ya subí el commit', false), false);
    assert.equal(agent.shouldRespond('jajaja qué bien', false), false);

    // Palabras afirmativas SIN propuesta pendiente no deben activar a la IA
    assert.equal(agent.shouldRespond('dale', false), false);
    assert.equal(agent.shouldRespond('sí', false), false);
    assert.equal(agent.shouldRespond('ok', false), false);

    // Activación por mención a la IA (true)
    assert.equal(agent.shouldRespond('@ia qué opinas de esto?', false), true);
    assert.equal(agent.shouldRespond('@arquitecto revisa la clase', false), true);
    assert.equal(agent.shouldRespond('@copilot ayuda con el modelo', false), true);
    assert.equal(agent.shouldRespond('ia: cómo ves la relación?', false), true);
    assert.equal(agent.shouldRespond('arquitecto: está bien?', false), true);

    // Activación por consultas técnicas o de diseño UML (true)
    assert.equal(agent.shouldRespond('qué opinas del diagrama', false), true);
    assert.equal(agent.shouldRespond('está bien esta relación', false), true);
    assert.equal(agent.shouldRespond('cómo modelo el módulo de pagos', false), true);
    assert.equal(agent.shouldRespond('qué es un atributo derivado', false), true);
    assert.equal(agent.shouldRespond('agrega una clase Pedido', false), true);
    assert.equal(agent.shouldRespond('conecta Usuario con Perfil', false), true);

    // Activación por confirmación afirmativa CON propuesta pendiente (true)
    assert.equal(agent.shouldRespond('sí', true), true);
    assert.equal(agent.shouldRespond('si', true), true);
    assert.equal(agent.shouldRespond('dale', true), true);
    assert.equal(agent.shouldRespond('hazlo', true), true);
    assert.equal(agent.shouldRespond('procede', true), true);
    assert.equal(agent.shouldRespond('cámbialo', true), true);
    assert.equal(agent.shouldRespond('cambialo', true), true);
    assert.equal(agent.shouldRespond('aplica los cambios', true), true);
    assert.equal(agent.shouldRespond('ok', true), true);
    assert.equal(agent.shouldRespond('okay', true), true);

    // Mensajes negativos o cancelaciones aun con propuesta pendiente deben descartarse
    assert.equal(agent.shouldRespond('no, espera', true), false);
    assert.equal(agent.shouldRespond('cancela', true), false);
});

test('TeamMemberAIAgent - 2. Identificación del usuario por su nombre y descarte de mensajes casuales', async () => {
    const manager = new RoomContextManager();
    const mockOpenAI = {
        chat: {
            completions: {
                create: async () => ({
                    choices: [{
                        message: {
                            content: JSON.stringify({
                                type: 'mentoring',
                                textResponse: 'Hola Carlos, la relación de agregación indica que la parte puede existir independientemente del todo.',
                                hasProposal: false,
                                proposal: null
                            })
                        }
                    }]
                })
            }
        }
    };

    const agent = new TeamMemberAIAgent(manager, mockOpenAI);
    const salaId = 'sala-devs';
    const usuario = { id: 'u-100', name: 'Carlos' };

    // 1. Mensaje casual ignorado
    const casualResult = await agent.processMessage({
        salaId,
        usuario,
        texto: 'voy por agua chicos',
        currentDiagram: { elements: [], relationships: [] }
    });
    assert.equal(casualResult.shouldReply, false);

    // 2. Consulta técnica con reconocimiento de nombre
    const techResult = await agent.processMessage({
        salaId,
        usuario,
        texto: 'cómo modelo la agregación?',
        currentDiagram: { elements: [], relationships: [] }
    });
    assert.equal(techResult.shouldReply, true);
    assert.ok(techResult.textResponse.includes('Carlos'), 'La respuesta debe dirigirse al usuario por su nombre');
    assert.equal(techResult.hasDiagramAction, false);
    assert.equal(techResult.proposal, null);
});

test('TeamMemberAIAgent - 3. Flujo de confirmación: propuesta, confirmación, aplicación y limpieza', async () => {
    const manager = new RoomContextManager();
    const initialDiagram = {
        elements: [{ id: 'elem-1', name: 'Usuario' }],
        relationships: []
    };
    const updatedDiagramMock = {
        elements: [
            { id: 'elem-1', name: 'Usuario' },
            { id: 'elem-2', name: 'Factura' }
        ],
        relationships: [
            { id: 'rel-1', sourceId: 'elem-1', targetId: 'elem-2', type: 'association' }
        ]
    };

    const mockOpenAI = {
        chat: {
            completions: {
                create: async () => ({
                    choices: [{
                        message: {
                            content: JSON.stringify({
                                type: 'proposal',
                                textResponse: 'He preparado la clase Factura vinculada a Usuario. ¿Quieres que lo aplique en la pizarra?',
                                hasProposal: true,
                                proposal: {
                                    changes: 'Agregar clase Factura vinculada a Usuario',
                                    updatedDiagram: updatedDiagramMock
                                }
                            })
                        }
                    }]
                })
            }
        }
    };

    const agent = new TeamMemberAIAgent(manager, mockOpenAI);
    const salaId = 'sala-pizarra';
    const usuario = { id: 'u-200', name: 'Elena' };

    // Paso 1: Usuario solicita agregar clase (se genera propuesta pero no se aplica de inmediato)
    const proposalResult = await agent.processMessage({
        salaId,
        usuario,
        texto: 'agrega una clase Factura para el usuario',
        currentDiagram: initialDiagram
    });

    assert.equal(proposalResult.shouldReply, true);
    assert.equal(proposalResult.hasDiagramAction, false, 'No debe aplicar el diagrama hasta recibir confirmación');
    assert.equal(proposalResult.updatedDiagram, null);
    assert.ok(proposalResult.proposal !== null, 'Debe retornar la propuesta');
    assert.ok(proposalResult.textResponse.includes('¿Quieres que lo aplique en la pizarra?'));

    // Verificar que la propuesta quedó almacenada en RoomContextManager
    const pendingInRoom = manager.getPendingProposal(salaId, usuario.id);
    assert.ok(pendingInRoom, 'Debe existir una propuesta pendiente para el usuario');
    assert.deepEqual(pendingInRoom.updatedDiagram, updatedDiagramMock);

    // Paso 2: Usuario confirma afirmativamente
    const confirmationResult = await agent.processMessage({
        salaId,
        usuario,
        texto: 'dale, aplícalo por favor',
        currentDiagram: initialDiagram
    });

    assert.equal(confirmationResult.shouldReply, true);
    assert.equal(confirmationResult.hasDiagramAction, true, 'Ahora sí debe indicar acción sobre el diagrama');
    assert.deepEqual(confirmationResult.updatedDiagram, updatedDiagramMock);
    assert.equal(confirmationResult.proposal, null);
    assert.equal(confirmationResult.textResponse, 'Listo Elena, he aplicado los cambios acordados en la pizarra.');

    // Verificar que la propuesta pendiente fue limpiada
    assert.equal(manager.getPendingProposal(salaId, usuario.id), null, 'La propuesta debe haber sido limpiada');

    // Verificar que el diagrama en el RoomContextManager fue actualizado
    assert.deepEqual(manager.getDiagram(salaId), updatedDiagramMock);
});

test('TeamMemberAIAgent - 4. Modo mentor conceptual (ej. explicando atributos derivados)', async () => {
    const manager = new RoomContextManager();
    const mockOpenAI = {
        chat: {
            completions: {
                create: async () => ({
                    choices: [{
                        message: {
                            content: JSON.stringify({
                                type: 'mentoring',
                                textResponse: 'Hola Marcos, un atributo derivado en UML es aquel cuyo valor se puede calcular a partir de otros atributos o elementos (por ejemplo, edad calculada a partir de fechaNacimiento). En los diagramas se denota anteponiendo una barra inclinada (/) al nombre.',
                                hasProposal: false,
                                proposal: null
                            })
                        }
                    }]
                })
            }
        }
    };

    const agent = new TeamMemberAIAgent(manager, mockOpenAI);
    const salaId = 'sala-mentor';
    const usuario = { id: 'u-300', name: 'Marcos' };

    const result = await agent.processMessage({
        salaId,
        usuario,
        texto: 'qué es un atributo derivado en UML?',
        currentDiagram: { elements: [], relationships: [] }
    });

    assert.equal(result.shouldReply, true);
    assert.equal(result.hasDiagramAction, false);
    assert.equal(result.updatedDiagram, null);
    assert.equal(result.proposal, null);
    assert.ok(result.textResponse.includes('Marcos'));
    assert.ok(result.textResponse.includes('atributo derivado'));
    assert.ok(result.textResponse.includes('/'));

    // No debe haber quedado propuesta pendiente
    assert.equal(manager.getPendingProposal(salaId, usuario.id), null);

    // Se debe haber registrado en el hilo del usuario
    const userContext = manager.getUserContext(salaId, usuario.id);
    assert.equal(userContext.queries.length, 1);
    assert.equal(userContext.lastInquiry, 'qué es un atributo derivado en UML?');
});

test('TeamMemberAIAgent - 5. Preservacion estricta de clases y conexiones existentes al agregar nuevos elementos', () => {
    const manager = new RoomContextManager();
    const agent = new TeamMemberAIAgent(manager, null);

    const initialDiagram = {
        elements: [
            { id: 'el_cliente', type: 'class', name: 'Cliente', x: 50, y: 50, attributes: ['- id: int'], methods: [] },
            { id: 'el_venta', type: 'class', name: 'Venta', x: 250, y: 50, attributes: ['- id: int'], methods: [] },
            { id: 'el_prod', type: 'class', name: 'Producto', x: 450, y: 50, attributes: ['- id: int'], methods: [] }
        ],
        connections: [
            { id: 'conn_1', source: 'el_cliente', target: 'el_venta', type: 'association', label: 'realiza' },
            { id: 'conn_2', source: 'el_venta', target: 'el_prod', type: 'association', label: 'incluye' }
        ]
    };

    // Propuesta de la IA donde agrega 'Dueno' y lo relaciona con 'Cliente' usando nombre de clase
    const proposed = {
        elements: [
            { name: 'Dueno', type: 'class', attributes: ['- idDueno: int'], methods: ['+ registrar(): void'] }
        ],
        connections: [
            { source: 'Dueno', target: 'Cliente', type: 'association', label: 'posee' }
        ]
    };

    const reconciled = agent.normalizeAndPreserveDiagram(initialDiagram, proposed);

    // 1. Debe contener las 3 clases originales + la nueva clase Dueno (total 4)
    assert.equal(reconciled.elements.length, 4);
    assert.ok(reconciled.elements.some(e => e.name === 'Cliente' && e.id === 'el_cliente'));
    assert.ok(reconciled.elements.some(e => e.name === 'Venta' && e.id === 'el_venta'));
    assert.ok(reconciled.elements.some(e => e.name === 'Producto' && e.id === 'el_prod'));
    assert.ok(reconciled.elements.some(e => e.name === 'Dueno'));

    // 2. Debe contener las 2 conexiones originales + la nueva conexion (total 3)
    assert.equal(reconciled.connections.length, 3);
    assert.ok(reconciled.connections.some(c => c.id === 'conn_1' && c.source === 'el_cliente' && c.target === 'el_venta'));
    assert.ok(reconciled.connections.some(c => c.id === 'conn_2' && c.source === 'el_venta' && c.target === 'el_prod'));

    // 3. La nueva conexion debe haber resuelto 'Cliente' -> 'el_cliente' y 'Dueno' -> id del Dueno
    const duenoid = reconciled.elements.find(e => e.name === 'Dueno').id;
    const nuevaConn = reconciled.connections.find(c => c.label === 'posee');
    assert.ok(nuevaConn);
    assert.equal(nuevaConn.source, duenoid);
    assert.equal(nuevaConn.target, 'el_cliente');
});

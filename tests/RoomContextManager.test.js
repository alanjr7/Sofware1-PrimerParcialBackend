import test from 'node:test';
import assert from 'node:assert/strict';
import defaultManager, { RoomContextManager } from '../src/services/RoomContextManager.js';

test('RoomContextManager - 1. Inicialización y almacenamiento de diagrama', () => {
    const manager = new RoomContextManager();
    const salaId = 'sala-101';

    // Room not initialized yet, getRoom should initialize default
    const room = manager.getRoom(salaId);
    assert.ok(room, 'Debe devolver un objeto de sala');
    assert.deepEqual(room.diagram, { elements: [], relationships: [] });
    assert.deepEqual(room.messages, []);
    assert.ok(room.userThreads instanceof Map);
    assert.ok(room.pendingProposals instanceof Map);

    // Initializing with specific diagram
    const salaId2 = 'sala-102';
    const customDiagram = {
        elements: [{ id: 'elem-1', name: 'User' }],
        relationships: [{ id: 'rel-1', from: 'elem-1', to: 'elem-2' }]
    };
    manager.initRoom(salaId2, customDiagram);
    assert.deepEqual(manager.getDiagram(salaId2), customDiagram);

    // Update diagram
    const updatedDiagram = {
        elements: [{ id: 'elem-1', name: 'User' }, { id: 'elem-2', name: 'Order' }],
        relationships: [{ id: 'rel-1', from: 'elem-1', to: 'elem-2', type: 'association' }]
    };
    manager.updateDiagram(salaId2, updatedDiagram);
    assert.deepEqual(manager.getDiagram(salaId2), updatedDiagram);
});

test('RoomContextManager - 2. Ventana deslizante de 30 mensajes', () => {
    const manager = new RoomContextManager();
    const salaId = 'sala-chat';

    for (let i = 1; i <= 35; i++) {
        manager.addMessage(salaId, {
            id: i,
            sender: `user-${i % 3}`,
            text: `Mensaje número ${i}`,
            timestamp: Date.now() + i
        });
    }

    const room = manager.getRoom(salaId);
    assert.equal(room.messages.length, 30, 'El historial debe estar limitado a un máximo de 30 mensajes');
    assert.equal(room.messages[0].id, 6, 'El primer mensaje retenido debe ser el 6');
    assert.equal(room.messages[29].id, 35, 'El último mensaje retenido debe ser el 35');

    // Test getRecentMessages with default limit (15) and custom limit
    const recent15 = manager.getRecentMessages(salaId);
    assert.equal(recent15.length, 15);
    assert.equal(recent15[0].id, 21);
    assert.equal(recent15[14].id, 35);

    const recent5 = manager.getRecentMessages(salaId, 5);
    assert.equal(recent5.length, 5);
    assert.equal(recent5[0].id, 31);
    assert.equal(recent5[4].id, 35);
});

test('RoomContextManager - 3. Aislamiento de contexto entre diferentes userId dentro de la misma sala', () => {
    const manager = new RoomContextManager();
    const salaId = 'sala-team';
    const userA = 'user-alice';
    const userB = 'user-bob';

    manager.recordUserQuery(salaId, userA, '¿Cómo estructurar la tabla de pagos?', 'Sugiero agregar PaymentMethod');
    manager.recordUserQuery(salaId, userB, 'Necesito conectar la autenticación', 'Puedes usar JWT en AuthService');

    const contextA = manager.getUserContext(salaId, userA);
    const contextB = manager.getUserContext(salaId, userB);

    assert.equal(contextA.lastInquiry, '¿Cómo estructurar la tabla de pagos?');
    assert.equal(contextA.queries.length, 1);
    assert.equal(contextA.queries[0].response, 'Sugiero agregar PaymentMethod');

    assert.equal(contextB.lastInquiry, 'Necesito conectar la autenticación');
    assert.equal(contextB.queries.length, 1);
    assert.equal(contextB.queries[0].response, 'Puedes usar JWT en AuthService');

    // Alice hace una segunda consulta
    manager.recordUserQuery(salaId, userA, '¿Qué atributos debe tener PaymentMethod?', 'id, name, type');
    const updatedContextA = manager.getUserContext(salaId, userA);
    assert.equal(updatedContextA.queries.length, 2);
    assert.equal(updatedContextA.lastInquiry, '¿Qué atributos debe tener PaymentMethod?');

    // Bob no debe verse afectado
    const updatedContextB = manager.getUserContext(salaId, userB);
    assert.equal(updatedContextB.queries.length, 1);
});

test('RoomContextManager - 4. Expiración correcta de propuesta pendiente después del TTL', async () => {
    const manager = new RoomContextManager();
    const salaId = 'sala-proposals';
    const userId = 'user-dev';

    const proposal = {
        action: 'ADD_CLASS',
        className: 'Invoice',
        attributes: ['id: int', 'total: float']
    };

    // Registrar propuesta con TTL corto de 50ms para la prueba
    manager.setPendingProposal(salaId, userId, proposal, 50);

    // Verificar que existe inmediatamente
    const immediate = manager.getPendingProposal(salaId, userId);
    assert.deepEqual(immediate, proposal, 'La propuesta debe recuperarse si no ha expirado');

    // Esperar a que expire (60ms)
    await new Promise((resolve) => setTimeout(resolve, 60));

    // Verificar que al consultar después de expirar retorna null y se limpia
    const expired = manager.getPendingProposal(salaId, userId);
    assert.equal(expired, null, 'Debe retornar null cuando ha expirado');

    // Verificar que la propuesta fue eliminada del Map interno
    const room = manager.getRoom(salaId);
    assert.equal(room.pendingProposals.has(userId), false, 'La propuesta expirada debe haberse eliminado');

    // Probar clearPendingProposal explícito
    manager.setPendingProposal(salaId, userId, proposal, 10000);
    assert.ok(manager.getPendingProposal(salaId, userId));
    manager.clearPendingProposal(salaId, userId);
    assert.equal(manager.getPendingProposal(salaId, userId), null);
});

test('RoomContextManager - 5. Instancia singleton exportada por defecto', () => {
    assert.ok(defaultManager instanceof RoomContextManager, 'El default export debe ser una instancia de RoomContextManager');
    const salaId = 'sala-singleton';
    defaultManager.initRoom(salaId);
    assert.ok(defaultManager.getRoom(salaId));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import { RoomContextManager } from '../src/services/RoomContextManager.js';
import { TeamMemberAIAgent } from '../src/agents/TeamMemberAIAgent.js';
import { setupSocketHandlers, usuarioIA } from '../src/index.js';

// Helper para levantar un servidor de prueba efímero
function createTestServer(options = {}) {
    return new Promise((resolve) => {
        const server = http.createServer();
        const io = new SocketIOServer(server, {
            cors: { origin: '*' }
        });

        const roomContextManager = options.roomContextManager || new RoomContextManager();
        const aiAgent = options.aiAgent || new TeamMemberAIAgent(roomContextManager, null);
        const salasActivas = options.salasActivas || new Map();
        const updateSalaCalls = [];
        const updateSalaFn = options.updateSalaFn || (async (id, data) => {
            updateSalaCalls.push({ id, data });
            return { id, data };
        });
        const getSalaByIdFn = options.getSalaByIdFn || (async (id) => {
            if (options.initialSalaData) {
                return options.initialSalaData;
            }
            return [{ id, xml: JSON.stringify({ elements: [{ id: 'init-1', name: 'InitClass' }], relationships: [] }) }];
        });

        setupSocketHandlers(io, {
            salasActivas,
            aiAgent,
            roomContextManager,
            updateSalaFn,
            getSalaByIdFn
        });

        server.listen(0, () => {
            const port = server.address().port;
            resolve({
                server,
                io,
                port,
                roomContextManager,
                aiAgent,
                salasActivas,
                updateSalaCalls,
                close: () => new Promise((res) => {
                    io.close(() => {
                        server.close(res);
                    });
                })
            });
        });
    });
}

function connectClient(port) {
    return ioClient(`http://localhost:${port}`, {
        transports: ['websocket'],
        forceNew: true
    });
}

test('SocketIntegration - 1. Presencia de la IA en la sala (evento unirseSala)', async () => {
    const testEnv = await createTestServer();
    const client = connectClient(testEnv.port);

    try {
        const salaId = 101;
        const usuario = { id: 'user-carlos', name: 'Carlos', role: 'DEV' };

        const usuariosConectadosPromise = new Promise((resolve) => {
            client.on('usuariosConectados', (data) => {
                resolve(data);
            });
        });

        const estadoInicialPromise = new Promise((resolve) => {
            client.on('estadoInicial', (data) => {
                resolve(data);
            });
        });

        client.emit('unirseSala', { salaId, usuario });

        const [usuariosData, estadoData] = await Promise.all([
            usuariosConectadosPromise,
            estadoInicialPromise
        ]);

        // 1. Debe incluir permanentemente al Arquitecto IA
        assert.ok(Array.isArray(usuariosData.usuarios), 'usuarios debe ser una lista');
        const aiInList = usuariosData.usuarios.find(u => u.isAI || u.id === 'ai_architect');
        assert.ok(aiInList, 'El Arquitecto IA debe estar presente en usuariosConectados');
        assert.equal(aiInList.id, 'ai_architect');
        assert.equal(aiInList.name, 'Arquitecto IA');
        assert.equal(aiInList.role, 'COLEGA');

        // 2. Debe incluir al usuario humano conectado
        const humanInList = usuariosData.usuarios.find(u => u.id === 'user-carlos');
        assert.ok(humanInList, 'El usuario humano debe estar presente');
        assert.equal(humanInList.name, 'Carlos');

        // 3. El contexto en RoomContextManager debe estar inicializado
        const room = testEnv.roomContextManager.getRoom(salaId);
        assert.ok(room, 'La sala debe estar inicializada en RoomContextManager');
        assert.equal(room.diagram.elements[0].name, 'InitClass');
    } finally {
        client.disconnect();
        await testEnv.close();
    }
});

test('SocketIntegration - 2. Intercepción de chat y respuesta IA (iaPensando y mensajeChatRecibido)', async () => {
    // Simulamos respuesta del agente IA para la prueba
    const roomContextManager = new RoomContextManager();
    const mockAgent = new TeamMemberAIAgent(roomContextManager, null);
    mockAgent.processMessage = async ({ usuario, texto }) => {
        return {
            shouldReply: true,
            textResponse: `Hola ${usuario.name}, recomiendo usar el patrón Factory para desacoplar la creación.`,
            hasDiagramAction: false,
            updatedDiagram: null,
            proposal: null
        };
    };

    const testEnv = await createTestServer({ roomContextManager, aiAgent: mockAgent });
    const client = connectClient(testEnv.port);

    try {
        const salaId = 202;
        const usuario = { id: 'user-maria', name: 'María' };

        // Unirse primero a la sala
        await new Promise((resolve) => {
            client.emit('unirseSala', { salaId, usuario });
            client.on('usuariosConectados', resolve);
        });

        const iaPensandoEvents = [];
        client.on('iaPensando', (data) => {
            iaPensandoEvents.push(data);
        });

        const chatMessages = [];
        const mensajeChatPromise = new Promise((resolve) => {
            client.on('mensajeChatRecibido', (msg) => {
                chatMessages.push(msg);
                if (msg.usuario?.isAI || msg.usuario?.id === 'ai_architect') {
                    resolve(msg);
                }
            });
        });

        // Enviar consulta técnica
        client.emit('enviarMensajeChat', {
            salaId,
            texto: '@ia cómo sugieres estructurar la creación de objetos?',
            usuario
        });

        const aiMessage = await mensajeChatPromise;

        // Validar indicador iaPensando (primero true para el usuario, luego false)
        assert.ok(iaPensandoEvents.length >= 2, 'Deben emitirse al menos 2 eventos iaPensando (true y false)');
        assert.equal(iaPensandoEvents[0].pensando, true);
        assert.equal(iaPensandoEvents[0].paraUsuario, 'María');
        assert.equal(iaPensandoEvents[1].pensando, false);

        // Validar respuesta del agente
        assert.ok(aiMessage, 'Debe recibirse mensaje de la IA');
        assert.equal(aiMessage.usuario.id, 'ai_architect');
        assert.equal(aiMessage.usuario.name, 'Arquitecto IA');
        assert.ok(aiMessage.texto.includes('patrón Factory'));

        // Validar que se almacenó en RoomContextManager
        const recent = testEnv.roomContextManager.getRecentMessages(salaId);
        assert.ok(recent.length >= 2, 'El historial de RoomContextManager debe tener el mensaje humano y el de la IA');
    } finally {
        client.disconnect();
        await testEnv.close();
    }
});

test('SocketIntegration - 3. Confirmación de propuesta y emisión de xmlActualizado', async () => {
    const salaId = 303;
    const usuario = { id: 'user-pedro', name: 'Pedro' };
    const roomContextManager = new RoomContextManager();

    // Establecer una propuesta pendiente para Pedro
    const proposalDiagram = {
        elements: [
            { id: 'elem-1', name: 'Factura' },
            { id: 'elem-2', name: 'DetalleFactura' }
        ],
        relationships: [
            { id: 'rel-1', from: 'elem-1', to: 'elem-2', type: 'composition' }
        ]
    };
    roomContextManager.initRoom(salaId);
    roomContextManager.setPendingProposal(salaId, usuario.id, {
        changes: 'Agregar clases Factura y DetalleFactura con composición',
        updatedDiagram: proposalDiagram
    });

    const testEnv = await createTestServer({ roomContextManager });
    const client = connectClient(testEnv.port);

    try {
        await new Promise((resolve) => {
            client.emit('unirseSala', { salaId, usuario });
            client.on('usuariosConectados', resolve);
        });

        const xmlActualizadoPromise = new Promise((resolve) => {
            client.on('xmlActualizado', (data) => {
                if (data.source === 'ai_teammate') {
                    resolve(data);
                }
            });
        });

        // Enviar mensaje de confirmación
        client.emit('enviarMensajeChat', {
            salaId,
            texto: 'Sí, cámbialo por favor',
            usuario
        });

        const xmlEvent = await xmlActualizadoPromise;

        // Validar evento xmlActualizado
        assert.ok(xmlEvent, 'Debe emitirse evento xmlActualizado');
        assert.deepEqual(xmlEvent.nuevoEstado, proposalDiagram);
        assert.equal(xmlEvent.source, 'ai_teammate');
        assert.ok(xmlEvent.message.includes('Pedro'), 'El mensaje debe mencionar al usuario que confirmó');

        // Validar persistencia en BD simulada
        assert.equal(testEnv.updateSalaCalls.length, 1, 'Debe haberse llamado a updateSala');
        assert.equal(testEnv.updateSalaCalls[0].id, salaId);

        // Validar que el diagrama se actualizó en RoomContextManager
        assert.deepEqual(testEnv.roomContextManager.getDiagram(salaId), proposalDiagram);
    } finally {
        client.disconnect();
        await testEnv.close();
    }
});

test('SocketIntegration - 4. Descarte de mensajes casuales entre humanos (sin spam de IA)', async () => {
    const testEnv = await createTestServer();
    const client = connectClient(testEnv.port);

    try {
        const salaId = 404;
        const usuario = { id: 'user-ana', name: 'Ana' };

        await new Promise((resolve) => {
            client.emit('unirseSala', { salaId, usuario });
            client.on('usuariosConectados', resolve);
        });

        let iaPensandoDisparado = false;
        client.on('iaPensando', () => {
            iaPensandoDisparado = true;
        });

        let aiMensajeDisparado = false;
        client.on('mensajeChatRecibido', (msg) => {
            if (msg.usuario?.isAI || msg.usuario?.id === 'ai_architect') {
                aiMensajeDisparado = true;
            }
        });

        // Enviar charla casual sin mención a IA ni propuesta pendiente
        client.emit('enviarMensajeChat', {
            salaId,
            texto: 'Hola a todos, voy por un café y regreso en 10',
            usuario
        });

        // Esperar un breve lapso para comprobar que la IA no interviene
        await new Promise((r) => setTimeout(r, 200));

        assert.equal(iaPensandoDisparado, false, 'No debe emitirse iaPensando para charla casual');
        assert.equal(aiMensajeDisparado, false, 'No debe emitirse respuesta de IA para charla casual');
    } finally {
        client.disconnect();
        await testEnv.close();
    }
});

test('SocketIntegration - 5. Actualización de lienzo (cambioInstantaneo y operacionElemento) sin spam en chat', async () => {
    const testEnv = await createTestServer();
    const client = connectClient(testEnv.port);

    try {
        const salaId = 505;
        const usuario = { id: 'user-luis', name: 'Luis' };

        await new Promise((resolve) => {
            client.emit('unirseSala', { salaId, usuario });
            client.on('usuariosConectados', resolve);
        });

        let aiMensajeDisparado = false;
        client.on('mensajeChatRecibido', (msg) => {
            if (msg.usuario?.isAI || msg.usuario?.id === 'ai_architect') {
                aiMensajeDisparado = true;
            }
        });

        const elementoNuevo = { id: 'box-1', type: 'class', name: 'Cliente' };

        // Enviar cambioInstantaneo
        client.emit('cambioInstantaneo', {
            salaId,
            usuario,
            tipo: 'crear',
            elemento: elementoNuevo
        });

        // Enviar operacionElemento
        const elementoModificado = { id: 'box-1', type: 'class', name: 'ClientePremium' };
        client.emit('operacionElemento', {
            salaId,
            usuario,
            operacion: 'modificar',
            elemento: elementoModificado
        });

        await new Promise((r) => setTimeout(r, 100));

        // Debe haberse actualizado el estado en RoomContextManager
        assert.deepEqual(testEnv.roomContextManager.getDiagram(salaId), elementoModificado);

        // No debe haberse generado mensajes de la IA
        assert.equal(aiMensajeDisparado, false, 'No deben enviarse mensajes de chat por cambios en el lienzo');
    } finally {
        client.disconnect();
        await testEnv.close();
    }
});

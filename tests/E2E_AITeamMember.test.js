import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import { RoomContextManager } from '../src/services/RoomContextManager.js';
import { TeamMemberAIAgent } from '../src/agents/TeamMemberAIAgent.js';
import { setupSocketHandlers } from '../src/index.js';

/**
 * Mock inteligente de OpenAI para pruebas E2E deterministas sin depender de red externa.
 */
function createMockOpenAI(handlers = {}) {
    return {
        chat: {
            completions: {
                create: async (params) => {
                    const userMsg = params.messages.find(m => m.role === 'user')?.content || '';
                    if (handlers.onPrompt) {
                        const custom = handlers.onPrompt(userMsg, params);
                        if (custom) return custom;
                    }

                    // 1. Consulta conceptual sobre atributos derivados en UML
                    if (userMsg.toLowerCase().includes('derivado')) {
                        return {
                            choices: [{
                                message: {
                                    content: JSON.stringify({
                                        type: 'mentoring',
                                        textResponse: 'Hola Alan, en UML un atributo derivado es aquel cuyo valor se puede computar o inferir a partir de otros atributos o elementos del modelo. En el diagrama se denota anteponiendo una barra inclinada (/) antes del nombre del atributo (por ejemplo: /edad o /totalNeto).',
                                        hasProposal: false,
                                        proposal: null
                                    })
                                }
                            }]
                        };
                    }

                    // 2. Consulta técnica sobre estructura del diagrama
                    if (userMsg.toLowerCase().includes('estructura') || userMsg.toLowerCase().includes('diagrama')) {
                        return {
                            choices: [{
                                message: {
                                    content: JSON.stringify({
                                        type: 'mentoring',
                                        textResponse: 'Hola Carlos, la estructura del diagrama cuenta con la clase InitClass. Te sugiero mantener alta cohesión y modularizar los componentes según el principio de responsabilidad única (SRP).',
                                        hasProposal: false,
                                        proposal: null
                                    })
                                }
                            }]
                        };
                    }

                    // 3. Solicitud de agregar clase Factura con id:int y total:float
                    if (userMsg.toLowerCase().includes('factura')) {
                        return {
                            choices: [{
                                message: {
                                    content: JSON.stringify({
                                        type: 'proposal',
                                        textResponse: 'He preparado la clase Factura con los atributos id:int y total:float para el modelo. ¿Quieres que lo aplique en la pizarra?',
                                        hasProposal: true,
                                        proposal: {
                                            changes: 'Agregar clase Factura con id:int y total:float',
                                            updatedDiagram: {
                                                elements: [
                                                    { id: 'init-1', name: 'InitClass' },
                                                    {
                                                        id: 'class-factura',
                                                        name: 'Factura',
                                                        attributes: ['id: int', 'total: float']
                                                    }
                                                ],
                                                relationships: []
                                            }
                                        }
                                    })
                                }
                            }]
                        };
                    }

                    // 4. Principios SOLID / Desacoplamiento
                    if (userMsg.toLowerCase().includes('solid') || userMsg.toLowerCase().includes('desacoplar')) {
                        return {
                            choices: [{
                                message: {
                                    content: JSON.stringify({
                                        type: 'mentoring',
                                        textResponse: 'Hola Alan, para desacoplar módulos te sugiero aplicar el Principio de Inversión de Dependencias (DIP), dependiendo de interfaces o abstracciones en lugar de implementaciones concretas.',
                                        hasProposal: false,
                                        proposal: null
                                    })
                                }
                            }]
                        };
                    }

                    // 5. Default mentoring
                    return {
                        choices: [{
                            message: {
                                content: JSON.stringify({
                                    type: 'mentoring',
                                    textResponse: 'Como compañero de equipo te recomiendo revisar el acoplamiento y la cohesión de las clases.',
                                    hasProposal: false,
                                    proposal: null
                                })
                            }
                        }]
                    };
                }
            }
        }
    };
}

/**
 * Crea una instancia de servidor Socket.IO de pruebas con dependencias inyectables.
 */
function createTestServer(options = {}) {
    return new Promise((resolve) => {
        const server = http.createServer();
        const io = new SocketIOServer(server, { cors: { origin: '*' } });

        const roomContextManager = options.roomContextManager || new RoomContextManager();
        const mockOpenAI = options.mockOpenAI || createMockOpenAI();
        const aiAgent = options.aiAgent || new TeamMemberAIAgent(roomContextManager, mockOpenAI);
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
            return [{
                id,
                xml: JSON.stringify({
                    elements: [{ id: 'init-1', name: 'InitClass' }],
                    relationships: []
                })
            }];
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

/**
 * Conecta un cliente Socket.IO al servidor de pruebas.
 */
function connectClient(port) {
    return ioClient(`http://localhost:${port}`, {
        transports: ['websocket'],
        forceNew: true
    });
}

/**
 * Espera la llegada de un evento específico en un socket con timeout y filtro.
 */
function waitForEvent(socket, eventName, filter = null, timeoutMs = 2500) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.off(eventName, listener);
            reject(new Error(`Timeout esperando evento "${eventName}" tras ${timeoutMs}ms`));
        }, timeoutMs);

        function listener(data) {
            if (!filter || filter(data)) {
                clearTimeout(timer);
                socket.off(eventName, listener);
                resolve(data);
            }
        }
        socket.on(eventName, listener);
    });
}

test('E2E - 1. Multi-usuario e Identificación contextual (Alan y Carlos)', async () => {
    const testEnv = await createTestServer();
    const clientAlan = connectClient(testEnv.port);
    const clientCarlos = connectClient(testEnv.port);

    const salaId = 1001;
    const alan = { id: 'user-alan', name: 'Alan', role: 'DEV' };
    const carlos = { id: 'user-carlos', name: 'Carlos', role: 'DEV' };

    try {
        // Alan y Carlos se unen a la misma sala
        const alanJoinedPromise = waitForEvent(clientAlan, 'usuariosConectados');
        clientAlan.emit('unirseSala', { salaId, usuario: alan });
        await alanJoinedPromise;

        const carlosJoinedPromise = waitForEvent(clientCarlos, 'usuariosConectados');
        clientCarlos.emit('unirseSala', { salaId, usuario: carlos });
        const usuariosData = await carlosJoinedPromise;

        // Verificar presencia del Arquitecto IA y los dos desarrolladores
        assert.ok(usuariosData.usuarios.some(u => u.id === 'ai_architect'), 'Arquitecto IA debe estar en la sala');
        assert.ok(usuariosData.usuarios.some(u => u.id === 'user-alan'), 'Alan debe estar en la sala');
        assert.ok(usuariosData.usuarios.some(u => u.id === 'user-carlos'), 'Carlos debe estar en la sala');

        // Paso A: Alan consulta sobre atributos derivados en UML (notación /)
        const thinkingAlanPromise = waitForEvent(clientAlan, 'iaPensando', d => d.pensando === true && d.paraUsuario === 'Alan');
        const aiResponseAlanPromise = waitForEvent(clientAlan, 'mensajeChatRecibido', m => m.usuario?.id === 'ai_architect' && m.texto.includes('Alan'));

        clientAlan.emit('enviarMensajeChat', {
            salaId,
            texto: '@ia ¿qué es un atributo derivado en UML y cómo se anota?',
            usuario: alan
        });

        const thinkingAlan = await thinkingAlanPromise;
        assert.equal(thinkingAlan.paraUsuario, 'Alan', 'El indicador debe mostrar que la IA piensa para Alan');

        const aiMsgAlan = await aiResponseAlanPromise;
        assert.ok(aiMsgAlan.texto.includes('Alan'), 'La respuesta de la IA debe dirigirse explícitamente a Alan');
        assert.ok(aiMsgAlan.texto.toLowerCase().includes('derivado'), 'Debe explicar el concepto de atributo derivado');
        assert.ok(aiMsgAlan.texto.includes('/'), 'Debe mencionar la barra inclinada (/) como notación UML');

        // Paso B: Carlos consulta sobre la estructura del diagrama
        const thinkingCarlosPromise = waitForEvent(clientCarlos, 'iaPensando', d => d.pensando === true && d.paraUsuario === 'Carlos');
        const aiResponseCarlosPromise = waitForEvent(clientCarlos, 'mensajeChatRecibido', m => m.usuario?.id === 'ai_architect' && m.texto.includes('Carlos'));

        clientCarlos.emit('enviarMensajeChat', {
            salaId,
            texto: '@ia ¿cómo ves la estructura actual del diagrama de clases?',
            usuario: carlos
        });

        const thinkingCarlos = await thinkingCarlosPromise;
        assert.equal(thinkingCarlos.paraUsuario, 'Carlos', 'El indicador debe mostrar que la IA piensa para Carlos');

        const aiMsgCarlos = await aiResponseCarlosPromise;
        assert.ok(aiMsgCarlos.texto.includes('Carlos'), 'La respuesta de la IA debe dirigirse explícitamente a Carlos');
        assert.ok(aiMsgCarlos.texto.toLowerCase().includes('estructura') || aiMsgCarlos.texto.includes('InitClass'), 'Debe responder sobre la estructura');

        // Paso C: Verificar aislamiento del hilo conversacional en RoomContextManager
        const contextAlan = testEnv.roomContextManager.getUserContext(salaId, alan.id);
        const contextCarlos = testEnv.roomContextManager.getUserContext(salaId, carlos.id);

        assert.ok(contextAlan.queries.length >= 1, 'Alan debe tener su hilo de consultas registrado');
        assert.ok(contextAlan.lastInquiry.includes('derivado'), 'El último tema de Alan debe ser sobre atributo derivado');

        assert.ok(contextCarlos.queries.length >= 1, 'Carlos debe tener su hilo de consultas registrado');
        assert.ok(contextCarlos.lastInquiry.includes('estructura'), 'El último tema de Carlos debe ser sobre la estructura');
        assert.notEqual(contextAlan.lastInquiry, contextCarlos.lastInquiry, 'Los hilos deben estar aislados');
    } finally {
        clientAlan.disconnect();
        clientCarlos.disconnect();
        await testEnv.close();
    }
});

test('E2E - 2. Ciclo Proponer -> Confirmar -> Ejecutar (Alan agrega clase Factura)', async () => {
    const testEnv = await createTestServer();
    const clientAlan = connectClient(testEnv.port);
    const clientCarlos = connectClient(testEnv.port);

    const salaId = 1002;
    const alan = { id: 'user-alan', name: 'Alan', role: 'DEV' };
    const carlos = { id: 'user-carlos', name: 'Carlos', role: 'DEV' };

    try {
        await Promise.all([
            new Promise(res => { clientAlan.emit('unirseSala', { salaId, usuario: alan }); clientAlan.on('usuariosConectados', res); }),
            new Promise(res => { clientCarlos.emit('unirseSala', { salaId, usuario: carlos }); clientCarlos.on('usuariosConectados', res); })
        ]);

        let xmlActualizadoEmitidoPrematuro = false;
        clientAlan.on('xmlActualizado', () => {
            xmlActualizadoEmitidoPrematuro = true;
        });

        // Paso 1: Alan solicita agregar la clase Factura
        const proposalMessagePromise = waitForEvent(clientAlan, 'mensajeChatRecibido', m => m.usuario?.id === 'ai_architect' && m.texto.includes('Factura'));

        clientAlan.emit('enviarMensajeChat', {
            salaId,
            texto: '@IA agrega la clase Factura con id:int y total:float',
            usuario: alan
        });

        const proposalMsg = await proposalMessagePromise;

        // Verificar que formula la propuesta y pide confirmación
        assert.ok(
            proposalMsg.texto.includes('¿Quieres que lo aplique en la pizarra?'),
            'La IA debe formular la pregunta de confirmación'
        );
        assert.ok(proposalMsg.texto.includes('Factura'), 'Debe mencionar la clase Factura');

        // Verificar que NO aplicó mutaciones prematuras al lienzo
        await new Promise(r => setTimeout(r, 100));
        assert.equal(xmlActualizadoEmitidoPrematuro, false, 'NO debe emitirse xmlActualizado prematuramente');

        // Verificar que la propuesta quedó pendiente en RoomContextManager
        const pending = testEnv.roomContextManager.getPendingProposal(salaId, alan.id);
        assert.ok(pending, 'Debe existir la propuesta pendiente en memoria');
        assert.ok(pending.updatedDiagram.elements.some(e => e.name === 'Factura'), 'El diagrama propuesto debe contener Factura');

        // El diagrama oficial de la sala aún no contiene Factura
        const currentDiagram = testEnv.roomContextManager.getDiagram(salaId);
        assert.ok(!currentDiagram.elements.some(e => e.name === 'Factura'), 'El diagrama activo NO debe mutar todavía');

        // Paso 2: Alan responde afirmativamente ("Sí, dale")
        clientAlan.off('xmlActualizado'); // Remover listener previo

        const xmlActualizadoAlanPromise = waitForEvent(clientAlan, 'xmlActualizado', d => d.source === 'ai_teammate');
        const xmlActualizadoCarlosPromise = waitForEvent(clientCarlos, 'xmlActualizado', d => d.source === 'ai_teammate');
        const confirmationChatPromise = waitForEvent(clientAlan, 'mensajeChatRecibido', m => m.usuario?.id === 'ai_architect' && m.texto.includes('aplicado'));

        clientAlan.emit('enviarMensajeChat', {
            salaId,
            texto: 'Sí, dale',
            usuario: alan
        });

        const [xmlEventAlan, xmlEventCarlos, confirmationChat] = await Promise.all([
            xmlActualizadoAlanPromise,
            xmlActualizadoCarlosPromise,
            confirmationChatPromise
        ]);

        // Verificar emisión de xmlActualizado para ambos clientes
        assert.ok(xmlEventAlan, 'Alan debe recibir xmlActualizado');
        assert.ok(xmlEventCarlos, 'Carlos debe recibir xmlActualizado');
        assert.equal(xmlEventAlan.source, 'ai_teammate');
        assert.ok(xmlEventAlan.message.includes('Alan'), 'El mensaje debe indicar atribución a Alan');

        // Verificar contenido del nuevo estado con la clase Factura
        const hasFactura = xmlEventAlan.nuevoEstado.elements.some(e => e.name === 'Factura');
        assert.ok(hasFactura, 'El nuevo estado debe incluir la clase Factura');

        // Verificar respuesta de confirmación en el chat
        assert.ok(confirmationChat.texto.includes('Alan'), 'El chat debe confirmar dirigiéndose a Alan');
        assert.ok(confirmationChat.texto.includes('aplicado los cambios'), 'Debe indicar que aplicó los cambios');

        // Verificar persistencia en base de datos
        assert.ok(testEnv.updateSalaCalls.length >= 1, 'Debe persistirse el nuevo estado en la base de datos');
        const lastCall = testEnv.updateSalaCalls[testEnv.updateSalaCalls.length - 1];
        assert.equal(lastCall.id, salaId);
        assert.ok(lastCall.data.xml.includes('Factura'));

        // Verificar que la memoria de la sala se actualizó y la propuesta pendiente se limpió
        assert.deepEqual(testEnv.roomContextManager.getDiagram(salaId), xmlEventAlan.nuevoEstado);
        assert.equal(testEnv.roomContextManager.getPendingProposal(salaId, alan.id), null, 'La propuesta debe haberse limpiado');
    } finally {
        clientAlan.disconnect();
        clientCarlos.disconnect();
        await testEnv.close();
    }
});

test('E2E - 3. Discreción y Filtro de Ruido (chat casual y eventos cosméticos del lienzo)', async () => {
    const testEnv = await createTestServer();
    const clientAlan = connectClient(testEnv.port);
    const clientCarlos = connectClient(testEnv.port);

    const salaId = 1003;
    const alan = { id: 'user-alan', name: 'Alan', role: 'DEV' };
    const carlos = { id: 'user-carlos', name: 'Carlos', role: 'DEV' };

    try {
        await Promise.all([
            new Promise(res => { clientAlan.emit('unirseSala', { salaId, usuario: alan }); clientAlan.on('usuariosConectados', res); }),
            new Promise(res => { clientCarlos.emit('unirseSala', { salaId, usuario: carlos }); clientCarlos.on('usuariosConectados', res); })
        ]);

        let aiIntervened = false;
        let aiThinking = false;

        const onMsg = (msg) => {
            if (msg.usuario?.isAI || msg.usuario?.id === 'ai_architect') {
                aiIntervened = true;
            }
        };
        const onThinking = (data) => {
            if (data.pensando) {
                aiThinking = true;
            }
        };

        clientAlan.on('mensajeChatRecibido', onMsg);
        clientCarlos.on('mensajeChatRecibido', onMsg);
        clientAlan.on('iaPensando', onThinking);
        clientCarlos.on('iaPensando', onThinking);

        // Caso A: Mensajes casuales entre desarrolladores
        const casualMessages = [
            { sender: alan, text: 'hola chicos, cómo están?' },
            { sender: carlos, text: 'todo bien por acá, ya subí el código al repo' },
            { sender: alan, text: 'perfecto, voy por un café y regreso' },
            { sender: carlos, text: 'dale' } // Afirmativo pero sin propuesta previa
        ];

        for (const msg of casualMessages) {
            const chatReceivedPromise = waitForEvent(clientCarlos, 'mensajeChatRecibido', m => m.texto === msg.text);
            const sendingClient = msg.sender.id === 'user-alan' ? clientAlan : clientCarlos;
            sendingClient.emit('enviarMensajeChat', {
                salaId,
                texto: msg.text,
                usuario: msg.sender
            });
            await chatReceivedPromise;
        }

        // Esperar para garantizar que la IA se mantuvo en silencio
        await new Promise(r => setTimeout(r, 200));

        assert.equal(aiIntervened, false, 'La IA NO debe enviar mensajes para conversaciones casuales');
        assert.equal(aiThinking, false, 'La IA NO debe activar el indicador iaPensando para charla casual');

        // Caso B: Eventos cosméticos en el lienzo (coordenadas x, y, dimensiones)
        clientCarlos.emit('cambioInstantaneo', {
            salaId,
            usuario: carlos,
            tipo: 'mover',
            elemento: { id: 'init-1', x: 280, y: 350 }
        });

        clientAlan.emit('operacionElemento', {
            salaId,
            usuario: alan,
            operacion: 'redimensionar',
            elemento: { id: 'init-1', x: 280, y: 350, width: 220, height: 110 }
        });

        await new Promise(r => setTimeout(r, 150));

        assert.equal(aiIntervened, false, 'Eventos puramente cosméticos de lienzo NO deben disparar respuestas de IA');
        assert.equal(aiThinking, false, 'Eventos de lienzo NO deben activar iaPensando');

        // El estado del diagrama en RoomContextManager debe reflejar la actualización cosmética
        const roomDiagram = testEnv.roomContextManager.getDiagram(salaId);
        assert.equal(roomDiagram.id, 'init-1');
        assert.equal(roomDiagram.x, 280);
    } finally {
        clientAlan.disconnect();
        clientCarlos.disconnect();
        await testEnv.close();
    }
});

test('E2E - 4. Expiración de Propuestas (TTL vencido no aplica mutaciones al lienzo)', async () => {
    const testEnv = await createTestServer();
    const clientAlan = connectClient(testEnv.port);

    const salaId = 1004;
    const alan = { id: 'user-alan', name: 'Alan', role: 'DEV' };

    try {
        await new Promise(res => {
            clientAlan.emit('unirseSala', { salaId, usuario: alan });
            clientAlan.on('usuariosConectados', res);
        });

        // 1. Registrar una propuesta pendiente con un TTL ultra corto (50ms)
        const proposalDiagram = {
            elements: [
                { id: 'init-1', name: 'InitClass' },
                { id: 'expired-class', name: 'ClaseExpirada', attributes: ['x: int'] }
            ],
            relationships: []
        };

        testEnv.roomContextManager.setPendingProposal(salaId, alan.id, {
            changes: 'Agregar ClaseExpirada',
            updatedDiagram: proposalDiagram
        }, 50);

        // Verificar que existe antes de expirar
        assert.ok(testEnv.roomContextManager.getPendingProposal(salaId, alan.id), 'La propuesta debe existir al inicio');

        // 2. Esperar 80ms para que expire el TTL
        await new Promise(r => setTimeout(r, 80));

        // Verificar que ya expiró y fue limpiada automáticamente
        assert.equal(testEnv.roomContextManager.getPendingProposal(salaId, alan.id), null, 'La propuesta debe haber expirado');

        let xmlActualizadoEmitido = false;
        let iaPensandoEmitido = false;

        clientAlan.on('xmlActualizado', () => {
            xmlActualizadoEmitido = true;
        });
        clientAlan.on('iaPensando', (d) => {
            if (d.pensando) iaPensandoEmitido = true;
        });

        // 3. Alan envía confirmación afirmativa tardía ("Sí, dale")
        clientAlan.emit('enviarMensajeChat', {
            salaId,
            texto: 'Sí, dale',
            usuario: alan
        });

        // Esperar lapso prudente
        await new Promise(r => setTimeout(r, 200));

        // 4. Verificar que NO se aplicaron cambios desfasados al diagrama
        assert.equal(xmlActualizadoEmitido, false, 'NO debe emitirse xmlActualizado para una propuesta expirada');
        assert.equal(iaPensandoEmitido, false, 'NO debe activarse la IA para una confirmación tardía desfasada');
        assert.equal(testEnv.updateSalaCalls.length, 0, 'NO debe persistirse nada en base de datos');

        // El diagrama en RoomContextManager debe conservarse intacto
        const currentDiagram = testEnv.roomContextManager.getDiagram(salaId);
        assert.ok(!currentDiagram.elements || !currentDiagram.elements.some(e => e.name === 'ClaseExpirada'), 'El diagrama NO debe contener la clase expirada');
    } finally {
        clientAlan.disconnect();
        await testEnv.close();
    }
});

test('E2E - 5. Flujo integral: Mentoría pedagógica previa, propuesta rechazada y posterior propuesta exitosa', async () => {
    const testEnv = await createTestServer();
    const clientAlan = connectClient(testEnv.port);
    const clientCarlos = connectClient(testEnv.port);

    const salaId = 1005;
    const alan = { id: 'user-alan', name: 'Alan', role: 'DEV' };
    const carlos = { id: 'user-carlos', name: 'Carlos', role: 'DEV' };

    try {
        await Promise.all([
            new Promise(res => { clientAlan.emit('unirseSala', { salaId, usuario: alan }); clientAlan.on('usuariosConectados', res); }),
            new Promise(res => { clientCarlos.emit('unirseSala', { salaId, usuario: carlos }); clientCarlos.on('usuariosConectados', res); })
        ]);

        // FASE 1: Alan consulta sobre Principios SOLID y desacoplamiento
        const mentoringAlanPromise = waitForEvent(clientAlan, 'mensajeChatRecibido', m => m.usuario?.id === 'ai_architect' && m.texto.includes('Alan'));
        clientAlan.emit('enviarMensajeChat', {
            salaId,
            texto: '@ia cómo sugieres aplicar principios SOLID para desacoplar las clases?',
            usuario: alan
        });

        const mentoringMsg = await mentoringAlanPromise;
        assert.ok(mentoringMsg.texto.includes('Alan'));
        assert.ok(mentoringMsg.texto.includes('Inversión de Dependencias') || mentoringMsg.texto.includes('DIP'));

        // FASE 2: Carlos solicita agregar clase Factura
        const proposalPromise = waitForEvent(clientCarlos, 'mensajeChatRecibido', m => m.usuario?.id === 'ai_architect' && m.texto.includes('Factura'));
        clientCarlos.emit('enviarMensajeChat', {
            salaId,
            texto: '@ia agrega la clase Factura con id:int y total:float',
            usuario: carlos
        });

        const proposalMsg = await proposalPromise;
        assert.ok(proposalMsg.texto.includes('¿Quieres que lo aplique en la pizarra?'));

        // Carlos rechaza la propuesta
        let xmlEmitidoTrasRechazo = false;
        clientCarlos.on('xmlActualizado', () => { xmlEmitidoTrasRechazo = true; });

        clientCarlos.emit('enviarMensajeChat', {
            salaId,
            texto: 'no, espera, mejor cancela eso',
            usuario: carlos
        });

        await new Promise(r => setTimeout(r, 150));
        assert.equal(xmlEmitidoTrasRechazo, false, 'No debe mutar el lienzo si el usuario cancela o rechaza');

        // Limpiar propuesta rechazada para la siguiente acción
        testEnv.roomContextManager.clearPendingProposal(salaId, carlos.id);

        // FASE 3: Alan ahora solicita agregar la clase Factura y la confirma
        const proposalAlanPromise = waitForEvent(clientAlan, 'mensajeChatRecibido', m => m.usuario?.id === 'ai_architect' && m.texto.includes('Factura') && m.texto.includes('Alan'));
        clientAlan.emit('enviarMensajeChat', {
            salaId,
            texto: '@ia agrega la clase Factura con id:int y total:float',
            usuario: alan
        });
        await proposalAlanPromise;

        const xmlConfirmadoPromise = waitForEvent(clientAlan, 'xmlActualizado', d => d.source === 'ai_teammate' && d.message.includes('Alan'));
        clientAlan.emit('enviarMensajeChat', {
            salaId,
            texto: 'Dale, procede por favor',
            usuario: alan
        });

        const xmlConfirmado = await xmlConfirmadoPromise;
        assert.equal(xmlConfirmado.source, 'ai_teammate');
        assert.ok(xmlConfirmado.nuevoEstado.elements.some(e => e.name === 'Factura'));
        assert.ok(xmlConfirmado.message.includes('Alan'));
    } finally {
        clientAlan.disconnect();
        clientCarlos.disconnect();
        await testEnv.close();
    }
});

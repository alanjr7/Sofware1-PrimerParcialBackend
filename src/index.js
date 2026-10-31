import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import app from './config/app.js';
import pool from './config/db.js';
import { Server as SocketIOServer } from 'socket.io';
import http from 'http';
import errorHandler from './middlewares/catchedAsync.js';
import { updateSala, getSalaById } from './models/sala.model.js';
import { initVersionTable } from './models/version.model.js';
import { initReunionTables } from './models/reunion.model.js';
import RoomContextManager from './services/RoomContextManager.js';
import TeamMemberAIAgent from './agents/TeamMemberAIAgent.js';

export const usuarioIA = { id: 'ai_architect', name: 'Arquitecto IA', isAI: true, role: 'COLEGA' };

export function setupSocketHandlers(io, dependencies = {}) {
    const {
        salasActivas = new Map(),
        aiAgent = new TeamMemberAIAgent(RoomContextManager),
        roomContextManager = RoomContextManager,
        updateSalaFn = updateSala,
        getSalaByIdFn = getSalaById
    } = dependencies;

    io.on('connection', (socket) => {
        console.log('🟢 Nuevo cliente conectado:', socket.id);

        socket.on('unirseSala', async ({ salaId, usuario }) => {
            try {
                const salaIdNormalizado = parseInt(salaId, 10);
                if (isNaN(salaIdNormalizado)) {
                    console.error(`❌ salaId inválido recibido: ${salaId} (tipo: ${typeof salaId})`);
                    socket.emit('errorSincronizacion', { message: 'ID de sala inválido' });
                    return;
                }
                socket.join(`sala_${salaIdNormalizado}`);
                socket.salaId = salaIdNormalizado;
                socket.usuario = usuario;            
                
                // Usar salaId normalizado en todas las operaciones
                if (!salasActivas.has(salaIdNormalizado)) {
                    salasActivas.set(salaIdNormalizado, {
                        usuarios: new Map(),
                        ultimoEstado: null,
                        ultimaModificacion: null,
                        mensajes: []
                    });
                }
                const sala = salasActivas.get(salaIdNormalizado);
                if (!sala.mensajes) {
                    sala.mensajes = [];
                }
                sala.usuarios.set(socket.id, { ...usuario, socketId: socket.id });
                const clientesSocketIO = io.sockets.adapter.rooms.get(`sala_${salaIdNormalizado}`);
                console.log(`📍 ESTADO DE SALA ${salaIdNormalizado}:`);
                console.log(`   👥 Usuarios en memoria: ${sala.usuarios.size}`);
                console.log(`   🔌 Clientes Socket.IO: ${clientesSocketIO ? clientesSocketIO.size : 0}`);
                
                sala.usuarios.forEach((user, socketId) => {
                    console.log(`      - ${user.name} (${user.isInvited ? 'INVITADO' : 'PROPIETARIO'}) - Socket: ${socketId}`);
                });
                
                socket.to(`sala_${salaIdNormalizado}`).emit('usuarioUnido', { 
                    usuario: usuario,
                    timestamp: Date.now()
                });

                // Enviar historial de chat acumulado de la sesión al usuario que se conecta
                socket.emit('historialChat', {
                    mensajes: sala.mensajes || []
                });
                
                try {
                    console.log(`🔍 Socket: Cargando estado para sala ID: ${salaIdNormalizado}`);
                    const salaData = await getSalaByIdFn(salaIdNormalizado);
                    if (salaData && salaData.length > 0 && salaData[0].xml) {
                        const estadoInicial = JSON.parse(salaData[0].xml);
                        
                        // 🚀 ENVIAR TANTO estadoInicial COMO xmlActualizado para máxima compatibilidad
                        socket.emit('estadoInicial', { state: estadoInicial });
                        
                        socket.emit('xmlActualizado', {
                            nuevoEstado: estadoInicial,
                            message: 'Sincronizando con pizarra actual',
                            timestamp: new Date(),
                            source: 'initial_sync'
                        });
                        
                        sala.ultimoEstado = estadoInicial;
                        roomContextManager.initRoom(salaIdNormalizado, estadoInicial);
                        console.log(`✅ Socket: Estado cargado y sincronizado para sala ${salaIdNormalizado}`);
                    } else {
                        console.log(`⚠️ Socket: No se encontró estado para sala ${salaIdNormalizado}`);
                        roomContextManager.initRoom(salaIdNormalizado, null);
                        socket.emit('estadoInicial', { state: null });
                    }
                } catch (error) {
                    console.error(`❌ Socket: Error cargando estado para sala ${salaIdNormalizado}:`, error);
                    roomContextManager.initRoom(salaIdNormalizado, null);
                    socket.emit('estadoInicial', { state: null });
                }
                
                // Incluir permanentemente a la IA como miembro virtual en la lista de conectados
                const usuariosConectados = [usuarioIA, ...Array.from(sala.usuarios.values())];
                io.to(`sala_${salaIdNormalizado}`).emit('usuariosConectados', { usuarios: usuariosConectados });
                
                usuariosConectados.forEach(u => {
                    console.log(`      - ${u.name} (${u.isAI ? 'IA/COLEGA' : (u.isInvited ? 'INVITADO/USERSALA' : 'PROPIETARIO')})`);
                });
            } catch (error) {
                console.error('Error al unirse a la sala:', error);
                socket.emit('errorSincronizacion', { message: 'Error al unirse a la sala' });
            }
        });

        // ============== CHAT DE SALA EN TIEMPO REAL ==============
        socket.on('enviarMensajeChat', async (data) => {
            try {
                const { salaId, texto, usuario, timestamp } = data;
                if (!salaId || !texto || !texto.trim()) {
                    console.warn('❌ Datos de mensaje inválidos:', data);
                    socket.emit('errorChat', { message: 'El mensaje no puede estar vacío' });
                    return;
                }

                const salaIdNormalizado = parseInt(salaId, 10);
                const roomName = `sala_${salaIdNormalizado}`;
                if (!socket.rooms || !socket.rooms.has(roomName)) {
                    socket.join(roomName);
                    socket.salaId = salaIdNormalizado;
                    if (usuario) socket.usuario = usuario;
                }
                if (!salasActivas.has(salaIdNormalizado)) {
                    salasActivas.set(salaIdNormalizado, {
                        usuarios: new Map(),
                        ultimoEstado: null,
                        ultimaModificacion: null,
                        mensajes: []
                    });
                }

                const sala = salasActivas.get(salaIdNormalizado);
                if (!sala.mensajes) sala.mensajes = [];

                const remitente = usuario || socket.usuario || { name: 'Anónimo' };
                // Ignorar mensajes enviados por la propia IA para prevenir bucles
                if (remitente.isAI || remitente.id === 'ai_architect') {
                    return;
                }

                const nuevoMensaje = {
                    id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                    salaId: salaIdNormalizado,
                    texto: texto.trim(),
                    usuario: remitente,
                    timestamp: timestamp || Date.now()
                };

                // Mantener un historial de hasta 100 mensajes en memoria por sala
                sala.mensajes.push(nuevoMensaje);
                if (sala.mensajes.length > 100) {
                    sala.mensajes.shift();
                }

                console.log(`💬 [Sala ${salaIdNormalizado}] Mensaje de ${nuevoMensaje.usuario?.name}: "${nuevoMensaje.texto}"`);

                // Transmitir inmediatamente el mensaje humano a la sala
                io.to(roomName).emit('mensajeChatRecibido', nuevoMensaje);
                socket.emit('mensajeChatRecibido', nuevoMensaje);

                // 1. Registrar mensaje humano en RoomContextManager
                roomContextManager.addMessage(salaIdNormalizado, nuevoMensaje);

                // 2. Verificar si TeamMemberAIAgent debe responder
                const userId = remitente.id || remitente.userId || 'unknown';
                const hasPendingProposal = Boolean(roomContextManager.getPendingProposal(salaIdNormalizado, userId));

                if (aiAgent.shouldRespond(nuevoMensaje.texto, hasPendingProposal)) {
                    // Activar indicador de tipeo
                    io.to(`sala_${salaIdNormalizado}`).emit('iaPensando', {
                        salaId: salaIdNormalizado,
                        pensando: true,
                        paraUsuario: nuevoMensaje.usuario?.name || 'Compañero'
                    });

                    try {
                        // Procesar mensaje en el agente colegial de IA
                        const result = await aiAgent.processMessage({
                            salaId: salaIdNormalizado,
                            usuario: nuevoMensaje.usuario,
                            texto: nuevoMensaje.texto,
                            currentDiagram: sala.ultimoEstado
                        });

                        // Apagar indicador de tipeo
                        io.to(`sala_${salaIdNormalizado}`).emit('iaPensando', {
                            salaId: salaIdNormalizado,
                            pensando: false
                        });

                        if (result && result.shouldReply) {
                            const aiMsg = {
                                id: `msg_ai_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                                salaId: salaIdNormalizado,
                                texto: result.textResponse,
                                usuario: usuarioIA,
                                timestamp: Date.now()
                            };

                            sala.mensajes.push(aiMsg);
                            if (sala.mensajes.length > 100) {
                                sala.mensajes.shift();
                            }
                            roomContextManager.addMessage(salaIdNormalizado, aiMsg);

                            io.to(roomName).emit('mensajeChatRecibido', aiMsg);
                            socket.emit('mensajeChatRecibido', aiMsg);
                        }

                        if (result && result.hasDiagramAction && result.updatedDiagram) {
                            sala.ultimoEstado = result.updatedDiagram;
                            roomContextManager.updateDiagram(salaIdNormalizado, result.updatedDiagram);

                            try {
                                await updateSalaFn(salaIdNormalizado, { xml: JSON.stringify(result.updatedDiagram) });
                            } catch (errDb) {
                                console.error('❌ Error persistiendo diagrama actualizado por IA en BD:', errDb);
                            }

                            io.to(`sala_${salaIdNormalizado}`).emit('xmlActualizado', {
                                nuevoEstado: result.updatedDiagram,
                                message: `Arquitecto IA actualizó el diagrama a petición de ${nuevoMensaje.usuario?.name || 'usuario'}`,
                                timestamp: new Date(),
                                source: 'ai_teammate'
                            });
                        }
                    } catch (errAi) {
                        console.error('❌ Error en procesamiento de IA:', errAi);
                        io.to(`sala_${salaIdNormalizado}`).emit('iaPensando', {
                            salaId: salaIdNormalizado,
                            pensando: false
                        });
                    }
                }
            } catch (error) {
                console.error('❌ Error enviando mensaje de chat:', error);
                socket.emit('errorChat', { message: 'Error enviando mensaje de chat' });
            }
        });
        
        socket.on('cambioInstantaneo', (data) => {
            try {
                const { salaId, usuario, tipo, elemento, timestamp } = data;
                if (!salaId || !tipo || !elemento) {
                    console.warn('❌ Datos insuficientes en cambioInstantaneo:', { salaId, tipo, elemento: elemento?.id });
                    socket.emit('errorSincronizacion', { message: 'Datos insuficientes para sincronizar cambio' });
                    return;
                }
                if (!usuario || !usuario.name) {
                    console.warn('❌ Usuario inválido en cambioInstantaneo:', usuario);
                    socket.emit('errorSincronizacion', { message: 'Usuario inválido para sincronizar cambio' });
                    return;
                }
                const salaIdNormalizado = parseInt(salaId, 10);
                if (!socket.salaId || parseInt(socket.salaId, 10) !== salaIdNormalizado) {
                    socket.emit('errorSincronizacion', { message: 'No estás conectado a esta sala' });
                    return;
                }

                // Mantener actualizado RoomContextManager sin generar spam en el chat
                roomContextManager.updateDiagram(salaIdNormalizado, elemento);

                socket.to(`sala_${salaIdNormalizado}`).emit('cambioRecibido', {
                    salaId: salaIdNormalizado,
                    usuario,
                    tipo,
                    elemento,
                    timestamp: timestamp || Date.now()
                });
            } catch (error) {
                console.error('❌ Error en cambio instantáneo:', error);
                socket.emit('errorSincronizacion', { message: 'Error al sincronizar cambio' });
            }
        });
        
        socket.on('operacionElemento', (data) => {
            try {
                const { salaId, usuario, operacion, elemento } = data;
                if (!salaId || !operacion || !elemento) {
                    console.warn('❌ Datos insuficientes en operacionElemento:', { salaId, operacion, elemento: elemento?.id });
                    socket.emit('errorSincronizacion', { message: 'Datos insuficientes para operación elemento' });
                    return;
                }
                if (!usuario || !usuario.name) {
                    console.warn('❌ Usuario inválido en operacionElemento:', usuario);
                    socket.emit('errorSincronizacion', { message: 'Usuario inválido para operación elemento' });
                    return;
                }
                const salaIdNormalizado = parseInt(salaId, 10);
                if (!socket.salaId || parseInt(socket.salaId, 10) !== salaIdNormalizado) {
                    socket.emit('errorSincronizacion', { message: 'No estás conectado a esta sala' });
                    return;
                }
                const sala = salasActivas.get(salaIdNormalizado);
                if (sala) {
                    sala.ultimaModificacion = Date.now();
                }

                // Mantener actualizado RoomContextManager sin generar spam en el chat
                roomContextManager.updateDiagram(salaIdNormalizado, elemento);

                socket.to(`sala_${salaIdNormalizado}`).emit('elementoOperado', {
                    salaId: salaIdNormalizado,
                    usuario,
                    operacion,
                    elemento,
                    timestamp: Date.now()
                });
            } catch (error) {
                console.error('❌ Error en operación elemento:', error);
                socket.emit('errorSincronizacion', { message: 'Error al sincronizar operación' });
            }
        });

        socket.on('actualizarDiagrama', (data) => {
            try {
                const { salaId, usuario, action } = data;
                const salaIdNormalizado = parseInt(salaId, 10);
                const socketSalaNormalizada = parseInt(socket.salaId, 10);
                if (!socket.salaId || socketSalaNormalizada !== salaIdNormalizado) {
                    socket.emit('errorSincronizacion', { message: 'No estás conectado a esta sala' });
                    return;
                }
                const sala = salasActivas.get(salaIdNormalizado);
                if (sala) {
                    sala.ultimaModificacion = Date.now();
                    if (action === 'fullState' && data.data && data.data.state) {
                        sala.ultimoEstado = data.data.state;
                        roomContextManager.updateDiagram(salaIdNormalizado, data.data.state);
                    }
                }
                socket.to(`sala_${salaIdNormalizado}`).emit('diagramaActualizado', data);
            } catch (error) {
                console.error('❌ Error actualizando diagrama:', error);
                socket.emit('errorSincronizacion', { message: 'Error al sincronizar cambios' });
            }
        });

        socket.on('guardarEstado', async ({ salaId, estado }) => {
            try {
                console.log(`💾 Socket: Guardando estado de sala ${salaId} en base de datos`);
                const estadoJson = JSON.stringify(estado);
                await updateSalaFn(salaId, undefined, estadoJson, undefined, io);
                const sala = salasActivas.get(salaId);
                if (sala) {
                    sala.ultimoEstado = estado;
                }
                roomContextManager.updateDiagram(salaId, estado);
                socket.emit('estadoGuardado', { success: true });
                console.log(`✅ Socket: Estado guardado exitosamente para sala ${salaId}`);
            } catch (error) {
                console.error(`❌ Socket: Error guardando estado para sala ${salaId}:`, error);
                socket.emit('errorSincronizacion', { message: 'Error al guardar en la base de datos' });
            }
        });

        socket.on('solicitarEstado', async ({ salaId }) => {
            try {
                const sala = salasActivas.get(salaId);
                if (sala && sala.ultimoEstado) {
                    socket.emit('estadoInicial', { state: sala.ultimoEstado });
                    return;
                }
                const salaData = await getSalaByIdFn(salaId);
                if (salaData && salaData.length > 0 && salaData[0].xml) {
                    const estadoInicial = JSON.parse(salaData[0].xml);
                    socket.emit('estadoInicial', { state: estadoInicial });
                    if (sala) {
                        sala.ultimoEstado = estadoInicial;
                    }
                    roomContextManager.initRoom(salaId, estadoInicial);
                } else {
                    socket.emit('estadoInicial', { state: null });
                }
            } catch (error) {
                console.error('Error cargando estado inicial:', error);
                socket.emit('errorSincronizacion', { message: 'Error al cargar estado inicial' });
            }
        });

        socket.on('disconnect', () => {
            try {
                console.log('🔴 Cliente desconectado:', socket.id);
                if (socket.salaId && socket.usuario) {
                    const sala = salasActivas.get(socket.salaId);
                    if (sala) {
                        sala.usuarios.delete(socket.id);
                        socket.to(`sala_${socket.salaId}`).emit('usuarioSalio', { 
                            usuario: socket.usuario,
                            usuarioId: socket.usuario.id,
                            timestamp: Date.now()
                        });
                        // Actualizar lista de presencia permanente incluyendo al Arquitecto IA
                        const usuariosRestantes = [usuarioIA, ...Array.from(sala.usuarios.values())];
                        io.to(`sala_${socket.salaId}`).emit('usuariosConectados', { usuarios: usuariosRestantes });

                        if (sala.usuarios.size === 0) {
                            console.log(`🗑️ Limpiando sala vacía ${socket.salaId}`);
                            salasActivas.delete(socket.salaId);
                        }
                    }
                }
            } catch (error) {
                console.error('Error en desconexión:', error);
            }
        });
    });
}

const server = http.createServer(app);
const io = new SocketIOServer(server, {
    cors: {
        origin: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        credentials: true
    }
});

app.set('io', io);
const salasActivas = new Map();
setupSocketHandlers(io, { salasActivas });

app.use((req, res, next) => {
    res.status(404).json({ error: 'Not Found' });
});
app.use(errorHandler);

const isTestEnv = process.env.NODE_ENV === 'test' || 
                  process.execArgv.includes('--test') ||
                  (process.argv[1] && !process.argv[1].endsWith('index.js'));

if (!isTestEnv) {
    pool.connect()
        .then(async () => {
            console.log("✅ Conectado exitosamente a la base de datos");
            await initVersionTable();
            await initReunionTables();
        })
        .catch(err => console.error("❌ Error conectando a la base de datos", err.stack));

    const PORT = process.env.PORT || 8083;
    server.listen(PORT, () => {
        console.log(`🚀 Servidor Express + Socket.IO corriendo en puerto ${PORT}`);
        console.log(`🔄 Sistema de colaboración en tiempo real activado`);
        console.log(`💾 Auto-guardado configurado cada 30 segundos`);
    });
}

export { app, server, io, salasActivas };
export default server;

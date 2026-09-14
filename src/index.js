import 'dotenv/config';
import app from './config/app.js';
import pool from './config/db.js';
import { Server as SocketIOServer } from 'socket.io';
import http from 'http';
import errorHandler from './middlewares/catchedAsync.js';
import { updateSala, getSalaById } from './models/sala.model.js';
import { initVersionTable } from './models/version.model.js';
import { initReunionTables } from './models/reunion.model.js';

pool.connect()
    .then(async () => {
        console.log("✅ Conectado exitosamente a la base de datos");
        await initVersionTable();
        await initReunionTables();
    })
    .catch(err => console.error("❌ Error conectando a la base de datos", err.stack));

const server = http.createServer(app);
const io = new SocketIOServer(server, {
    cors: {
        origin: 'http://localhost:5000',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        credentials: true
    }
});

app.set('io', io);
const salasActivas = new Map();

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
                const salaData = await getSalaById(salaIdNormalizado);
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
                    console.log(`✅ Socket: Estado cargado y sincronizado para sala ${salaIdNormalizado}`);
                } else {
                    console.log(`⚠️ Socket: No se encontró estado para sala ${salaIdNormalizado}`);
                    socket.emit('estadoInicial', { state: null });
                }
            } catch (error) {
                console.error(`❌ Socket: Error cargando estado para sala ${salaIdNormalizado}:`, error);
                socket.emit('estadoInicial', { state: null });
            }
            
            const usuariosConectados = Array.from(sala.usuarios.values());
            io.to(`sala_${salaIdNormalizado}`).emit('usuariosConectados', { usuarios: usuariosConectados });
            
            usuariosConectados.forEach(u => {
                console.log(`      - ${u.name} (${u.isInvited ? 'INVITADO/USERSALA' : 'PROPIETARIO'})`);
            });
        } catch (error) {
            console.error('Error al unirse a la sala:', error);
            socket.emit('errorSincronizacion', { message: 'Error al unirse a la sala' });
        }
    });

    // ============== CHAT DE SALA EN TIEMPO REAL ==============
    socket.on('enviarMensajeChat', (data) => {
        try {
            const { salaId, texto, usuario, timestamp } = data;
            if (!salaId || !texto || !texto.trim()) {
                console.warn('❌ Datos de mensaje inválidos:', data);
                socket.emit('errorChat', { message: 'El mensaje no puede estar vacío' });
                return;
            }

            const salaIdNormalizado = parseInt(salaId, 10);
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

            const nuevoMensaje = {
                id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                salaId: salaIdNormalizado,
                texto: texto.trim(),
                usuario: usuario || socket.usuario || { name: 'Anónimo' },
                timestamp: timestamp || Date.now()
            };

            // Mantener un historial de hasta 100 mensajes en memoria por sala
            sala.mensajes.push(nuevoMensaje);
            if (sala.mensajes.length > 100) {
                sala.mensajes.shift();
            }

            console.log(`💬 [Sala ${salaIdNormalizado}] Mensaje de ${nuevoMensaje.usuario?.name}: "${nuevoMensaje.texto}"`);

            // Transmitir a todos los miembros de la sala (incluyendo remitente para confirmación instantánea)
            io.to(`sala_${salaIdNormalizado}`).emit('mensajeChatRecibido', nuevoMensaje);
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
                if (action === 'fullState') {
                    sala.ultimoEstado = data.data.state;
                }
            }
            const clientesEnSala = io.sockets.adapter.rooms.get(`sala_${salaIdNormalizado}`);
            const numClientesDestino = clientesEnSala ? clientesEnSala.size - 1 : 0;
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
            await updateSala(salaId, undefined, estadoJson, undefined, io);
            const sala = salasActivas.get(salaId);
            if (sala) {
                sala.ultimoEstado = estado;
            }
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
            const salaData = await getSalaById(salaId);
            if (salaData && salaData.length > 0 && salaData[0].xml) {
                const estadoInicial = JSON.parse(salaData[0].xml);
                socket.emit('estadoInicial', { state: estadoInicial });
                if (sala) {
                    sala.ultimoEstado = estadoInicial;
                }
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
                    // Actualizar lista de presencia para los usuarios restantes
                    const usuariosRestantes = Array.from(sala.usuarios.values());
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

app.use((req, res, next) => {
    res.status(404).json({ error: 'Not Found' });
});
app.use(errorHandler);

const PORT = 8083;
server.listen(PORT, () => {
    console.log(`🚀 Servidor Express + Socket.IO corriendo en puerto ${PORT}`);
    console.log(`🔄 Sistema de colaboración en tiempo real activado`);
    console.log(`💾 Auto-guardado configurado cada 30 segundos`);
});

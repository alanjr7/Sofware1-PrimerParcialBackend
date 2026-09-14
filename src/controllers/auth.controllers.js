import { createUser, verifyUserCredentials, getUserById, deleteUser, getUserByEmail, getUsersExcludingId, updateUser, updateUserWithoutPassword } from '../models/auth.model.js';
import { createAccesToken } from '../libs/jwt.js';
import { catchedAsync, response } from '../middlewares/catchedAsync.js';

class AuthController {
    constructor() {}

    register = catchedAsync(async (req, res) => {
        const { name, email, password } = req.body;
        
        try {
            const user = await createUser(name, email, password);
            
            if (!user) {
                return response(res, 400, { 
                    error: true, 
                    message: 'No se pudo crear el usuario. Posiblemente el email ya existe.' 
                });
            }
            
            const userALter = await getUserByEmail(email);
            
            if (!userALter) {
                return response(res, 500, { 
                    error: true, 
                    message: 'Error interno: Usuario creado pero no encontrado' 
                });
            }
            
            const token = await createAccesToken({ id: userALter.id });
            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'Strict'
            });
            
            response(res, 200, { 
                token, 
                user: { id: userALter.id, name: userALter.name, email: userALter.email } 
            });
            
        } catch (error) {
            console.error('Error en registro:', error);
            return response(res, 500, { 
                error: true, 
                message: 'Error interno del servidor durante el registro' 
            });
        }
    });
    
    login = catchedAsync(async (req, res) => {
        const { email, password } = req.body;
        const user = await verifyUserCredentials(email, password);
        
        // Verificar si el usuario existe y las credenciales son válidas
        if (!user) {
            return response(res, 401, { 
                error: true, 
                message: 'Credenciales inválidas' 
            });
        }
        
        const token = await createAccesToken({ id: user.id });
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Strict'
        });
        response(res, 200, { token, user: { id: user.id, name: user.name, email: user.email } });
    });

    logout = catchedAsync(async (req, res) => {
        res.cookie('token', '', {
            expires: new Date(0),
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Strict'
        });
        response(res, 200, { msg: 'Logout successful' });
    });

    profile = catchedAsync(async (req, res) => {
        console.log('Request to profile endpoint:', req.user.id);
        const user = await getUserById(req.user.id);
        response(res, 200, user);
    });

    update = catchedAsync(async (req, res) => {
        const { name, email, password } = req.body;
        const userId = req.user.id;

        if (!name || !email) {
            return response(res, 400, {
                error: true,
                message: 'Nombre y correo electrónico son requeridos.'
            });
        }

        try {
            let updatedUser;
            if (password && password.trim() !== '') {
                updatedUser = await updateUser(userId, name.trim(), email.trim().toLowerCase(), password);
            } else {
                updatedUser = await updateUserWithoutPassword(userId, name.trim(), email.trim().toLowerCase());
            }

            if (!updatedUser) {
                return response(res, 404, {
                    error: true,
                    message: 'Usuario no encontrado o dado de baja.'
                });
            }

            response(res, 200, {
                success: true,
                message: 'Perfil actualizado correctamente',
                user: updatedUser
            });
        } catch (error) {
            console.error('Error al actualizar perfil:', error);
            if (error.code === '23505') {
                return response(res, 400, {
                    error: true,
                    message: 'El correo electrónico ya está registrado por otro usuario.'
                });
            }
            return response(res, 500, {
                error: true,
                message: 'Error interno del servidor al actualizar el perfil.'
            });
        }
    });
    
    getSalaByNotEmail = catchedAsync(async (req, res) => {
        const userId = req.user.id;
        const sala = await getUsersExcludingId(userId);
        response(res, 200, sala);
    });

    delete = catchedAsync(async (req, res) => {
        const user = await deleteUser(req.user.id);
        res.cookie('token', '', {
            expires: new Date(0),
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Strict'
        });
        response(res, 200, {
            success: true,
            message: 'Cuenta eliminada y dada de baja exitosamente',
            user
        });
    });
}

export default new AuthController();

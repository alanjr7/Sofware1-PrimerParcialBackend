import jwt from 'jsonwebtoken';
import { TOKEN_SECRET } from '../config.js';

export const authRequired = (req, res, next) => {
    let token = null;

    // 1. Extraer token desde Header Authorization (Bearer Token)
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    }

    // 2. Si no viene en Header, intentar obtenerlo de las Cookies
    if (!token && req.cookies) {
        token = req.cookies.token;
    }

    if (!token) {
        return res.status(401).json({ error: true, message: "Token requerido, autorización denegada" });
    }

    jwt.verify(token, TOKEN_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: true, message: "Token inválido o expirado" });
        }
        req.user = user;
        next();
    });
};

export const checkNotAuthenticated = (req, res, next) => {
    let token = null;
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    }
    if (!token && req.cookies) {
        token = req.cookies.token;
    }

    if (token) {
        return res.status(401).json({ error: true, message: "Token de autorización existente" });
    } else {
        next();
    }
};

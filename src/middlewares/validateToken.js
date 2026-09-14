import jwt from 'jsonwebtoken';
import { TOKEN_SECRET } from '../config.js';

export const authRequired = (req, res, next) => {
    const { token } = req.cookies;
    console.log("Token recibido: ", token);  // Debug: Verificar si el token está presente
    
    if (!token)
        return res.status(401).json({ error: true, message: "No token, authorization denied " });
    jwt.verify(token, TOKEN_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: true, message: "Invalid token" });
        req.user = user;
        next()
    })
};

export const checkNotAuthenticated = (req, res, next) => {
  const { token } = req.cookies;
  if (token) {
    return res.status(401).json({ error: true, message: "token authorization exist" });
  } else {
    next();
  }
};

import express from 'express';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import cors from 'cors'; 
import authRoutes from '../routes/auth.routes.js';
import salaRoutes from '../routes/sala.routes.js';
import usersalaRoutes from '../routes/usersala.routes.js';
import crearPaginaRoutes from '../routes/crearPagina.routes.js';
import aiRoutes from '../routes/ai.routes.js';
import versionRoutes from '../routes/version.routes.js';
import reunionRoutes from '../routes/reunion.routes.js';

const app = express();

app.use(morgan('dev'));
app.use(express.json());
app.use(cookieParser());

app.use(cors({
    origin: 'http://localhost:5000',
    credentials: true
}));

app.use("/apis", authRoutes);

app.use("/apis/sala", salaRoutes);
app.use("/apis/sala/:salaId/versiones", versionRoutes);
app.use("/apis/versiones", versionRoutes);

app.use("/apis/usersala", usersalaRoutes);
app.use("/apis/reuniones", reunionRoutes);

app.use('/apis/crearPagina', crearPaginaRoutes);

app.use('/apis/ai', aiRoutes);

export default app;

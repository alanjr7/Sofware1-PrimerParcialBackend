import { Router } from 'express';
import reunionController from '../controllers/reunion.controllers.js';
import { authRequired } from '../middlewares/validateToken.js';

const router = Router();

// Listar y Crear Reuniones
router.route('/')
    .get(authRequired, reunionController.getMisReuniones)
    .post(authRequired, reunionController.registerReunion);

// Detalle y Cancelación
router.route('/:id')
    .get(authRequired, reunionController.getDetalleReunion)
    .delete(authRequired, reunionController.cancelarReunion);

// Invitar a un colaborador adicional
router.route('/:id/invitar')
    .post(authRequired, reunionController.invitarAColaborador);

export default router;

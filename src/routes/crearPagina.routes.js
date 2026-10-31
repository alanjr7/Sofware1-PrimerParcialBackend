import { Router } from 'express';
import CrearPaginaController from '../controllers/crearPagina.controller.js';

const router = Router();

router.post('/exportarSpringBoot/:id', CrearPaginaController.exportarSpringBootDesdeSala);

router.post('/exportarSpringBoot', CrearPaginaController.exportarSpringBootConRelaciones);

router.post('/exportarLaravel/:id', CrearPaginaController.exportarLaravelDesdeSala);

router.post('/exportarLaravel', CrearPaginaController.exportarLaravelConRelaciones);

router.post('/:id', CrearPaginaController.exportar);

export default router;


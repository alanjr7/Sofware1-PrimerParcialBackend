import { Router } from "express";
import salaController from '../controllers/sala.controllers.js';

import { authRequired } from '../middlewares/validateToken.js';
import salaSchema from '../schemas/salaSchema.js';
import validateSchema from '../middlewares/validateSchema.js';

const router = Router();

router.route("/")
    .post(authRequired, validateSchema(salaSchema), salaController.register)
    .get(authRequired, salaController.getSalas);

router.route("/:id")
    .put(salaController.update)
    .get(salaController.getSalaById)
    .delete(authRequired, salaController.delete);

export default router;

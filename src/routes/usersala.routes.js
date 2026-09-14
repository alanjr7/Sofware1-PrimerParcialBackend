import { Router } from "express";
import usersalaController from '../controllers/usersala.controllers.js';

import { authRequired } from '../middlewares/validateToken.js';
import usersalaSchema from '../schemas/usersalaSchema.js';
import validateSchema from '../middlewares/validateSchema.js';

const router = Router();

router.route("/")
    .post(authRequired, validateSchema(usersalaSchema), usersalaController.register)
    .get(authRequired, usersalaController.getUserSalas);

router.get("/user/:userId/salas", usersalaController.getUserSalasByUserId);
router.get("/sala/:salaId", usersalaController.getUsersBySala);

router.route("/:id")
    .get(authRequired, usersalaController.getUserSalaById)
    .delete(authRequired, usersalaController.delete);

export default router;


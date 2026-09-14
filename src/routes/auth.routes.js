import { Router } from "express";
import userController from '../controllers/auth.controllers.js';

import { authRequired } from '../middlewares/validateToken.js';
import userSchema from '../schemas/userSchema.js';
import validateSchema from '../middlewares/validateSchema.js';

const router = Router();

router.post('/register', validateSchema(userSchema), userController.register);

router.post('/login', userController.login);

router.post('/logout', userController.logout);

router.get("/notEmail", authRequired, userController.getSalaByNotEmail);

router.get("/", authRequired, userController.profile);

router.put("/", authRequired, userController.update);
router.put("/profile", authRequired, userController.update);

router.delete("/", authRequired, userController.delete);

export default router;

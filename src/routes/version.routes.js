import { Router } from "express";
import versionController from '../controllers/version.controllers.js';

const router = Router({ mergeParams: true });

// Rutas anidadas bajo /apis/sala/:salaId/versiones o directas
router.route("/")
    .post(versionController.create)
    .get(versionController.getVersions);

router.route("/:versionId")
    .get(versionController.getVersionById)
    .delete(versionController.delete);

router.route("/:versionId/restore")
    .post(versionController.restore);

export default router;

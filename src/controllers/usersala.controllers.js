import { createUserSala, getUserSalaById, getUserSalas, getUsersBySala, deleteUserSala } from '../models/usersala.model.js';
import { catchedAsync, response } from '../middlewares/catchedAsync.js';

class UserSalaController {
    constructor() {}

    register = catchedAsync(async (req, res) => {
        const { salas_id, userId } = req.body;
        const usersala = await createUserSala(userId, salas_id);
        response(res, 201, usersala);
    });

    getUserSalaById = catchedAsync(async (req, res) => {
        const { id } = req.params;
        const usersala = await getUserSalaById(id);
        response(res, 200, usersala);
    });

    getUserSalas = catchedAsync(async (req, res) => {
        const userId = req.user.id;
        const usersalas = await getUserSalas(userId);
        response(res, 200, usersalas);
    });

    getUserSalasByUserId = catchedAsync(async (req, res) => {
        const { userId } = req.params;
        const usersalas = await getUserSalas(userId);
        response(res, 200, usersalas);
    });

    getUsersBySala = catchedAsync(async (req, res) => {
        const { salaId } = req.params;
        const users = await getUsersBySala(salaId);
        response(res, 200, users);
    });

    delete = catchedAsync(async (req, res) => {
        const { id } = req.params;
        const usersala = await deleteUserSala(id);
        response(res, 200, usersala);
    });
}

export default new UserSalaController();


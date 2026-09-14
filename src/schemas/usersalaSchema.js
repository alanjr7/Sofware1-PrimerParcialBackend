import Joi from 'joi';

const usersalaSchema = Joi.object({
  salas_id: Joi.number().integer().required().messages({
    'any.required': 'El ID de la sala es requerido',
    'number.base': 'El ID de la sala debe ser un número',
    'number.integer': 'El ID de la sala debe ser un entero'
  }),
  userId: Joi.number().integer().required().messages({
    'any.required': 'Usuario es requerido',
    'number.base': 'El ID de la sala debe ser un número',
    'number.integer': 'El ID del Usuario debe ser un entero'
  }),
});

export default usersalaSchema;

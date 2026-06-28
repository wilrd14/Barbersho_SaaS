import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import * as appointmentsController from '../controllers/appointments.controller';

const router = Router();

router.get('/locale/:localeId', authenticate, authorize('superuser', 'admin'), appointmentsController.getByLocale);
router.get('/mine', authenticate, appointmentsController.getMyAppointments);
router.get('/slots/:barberId/:date', appointmentsController.getAvailableSlots);
router.post('/', authenticate, appointmentsController.create);
router.put('/:id/cancel', authenticate, appointmentsController.cancel);
router.put('/:id/status', authenticate, authorize('superuser', 'admin'), appointmentsController.updateStatus);

export default router;

import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import * as servicesController from '../controllers/services.controller';

const router = Router();

router.get('/barber/:barberId', authenticate, servicesController.getByBarber);
router.get('/locale/:localeId', servicesController.getByLocale);
router.post('/', authenticate, authorize('superuser', 'admin'), servicesController.create);
router.put('/:id', authenticate, authorize('superuser', 'admin'), servicesController.update);
router.delete('/:id', authenticate, authorize('superuser', 'admin'), servicesController.remove);

export default router;

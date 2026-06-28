import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import * as clientsController from '../controllers/clients.controller';

const router = Router();

router.get('/locale/:localeId', authenticate, authorize('superuser', 'admin'), clientsController.getByLocale);
router.get('/profile', authenticate, clientsController.getProfile);
router.post('/profile', authenticate, clientsController.createProfile);
router.put('/visit/:localeId', authenticate, clientsController.updateLastVisit);

export default router;

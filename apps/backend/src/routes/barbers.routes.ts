import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import * as barbersController from '../controllers/barbers.controller';

const router = Router();

router.get('/locale/:localeId', authenticate, barbersController.getByLocale);
router.post('/', authenticate, authorize('superuser', 'admin'), barbersController.create);
router.put('/:id', authenticate, authorize('superuser', 'admin'), barbersController.update);
router.delete('/:id', authenticate, authorize('superuser', 'admin'), barbersController.remove);

export default router;

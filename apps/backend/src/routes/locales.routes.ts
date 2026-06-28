import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import * as localesController from '../controllers/locales.controller';

const router = Router();

router.get('/', authenticate, localesController.getAll);
router.get('/:id', authenticate, localesController.getById);
router.post('/', authenticate, authorize('superuser'), localesController.create);
router.put('/:id', authenticate, authorize('superuser', 'admin'), localesController.update);
router.delete('/:id', authenticate, authorize('superuser'), localesController.remove);

export default router;

import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import * as inventoryController from '../controllers/inventory.controller';

const router = Router();

router.get('/locale/:localeId', authenticate, inventoryController.getByLocale);
router.post('/', authenticate, authorize('superuser', 'admin'), inventoryController.create);
router.put('/:id', authenticate, authorize('superuser', 'admin'), inventoryController.update);
router.delete('/:id', authenticate, authorize('superuser', 'admin'), inventoryController.remove);

export default router;

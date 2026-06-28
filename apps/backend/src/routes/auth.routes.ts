import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as authController from '../controllers/auth.controller';

const router = Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/me', authenticate, authController.me);

export default router;

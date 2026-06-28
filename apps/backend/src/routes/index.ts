import { Router } from 'express';
import authRoutes from './auth.routes';
import localesRoutes from './locales.routes';
import barbersRoutes from './barbers.routes';
import servicesRoutes from './services.routes';
import appointmentsRoutes from './appointments.routes';
import inventoryRoutes from './inventory.routes';
import clientsRoutes from './clients.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/locales', localesRoutes);
router.use('/barbers', barbersRoutes);
router.use('/services', servicesRoutes);
router.use('/appointments', appointmentsRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/clients', clientsRoutes);

export default router;

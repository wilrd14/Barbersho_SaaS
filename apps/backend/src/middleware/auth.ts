import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '@barbershop/shared';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: UserRole;
    locale_id?: string;
  };
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthRequest['user'];
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

export function authorize(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    next();
  };
}

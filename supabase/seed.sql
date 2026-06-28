-- Seed: Crear superuser por defecto
-- NOTA: El usuario debe crearse primero por auth.signUp() antes de insertar en users

-- Insertar un local de ejemplo
INSERT INTO locales (id, name, address, phone, whatsapp, website, created_by)
VALUES (
  'b1a2c3d4-e5f6-7890-abcd-ef1234567890',
  'Barbería El Clásico',
  'Av. Principal 123, Centro',
  '+52 55 1234 5678',
  '+525512345678',
  'https://barberiaelclasico.com',
  (SELECT id FROM users WHERE role = 'superuser' LIMIT 1)
);

-- Insertar barberos de ejemplo
INSERT INTO barbers (locale_id, name, phone, specialties) VALUES
  ('b1a2c3d4-e5f6-7890-abcd-ef1234567890', 'Carlos López', '+52 55 1111 2222', 'Corte clásico, Barba'),
  ('b1a2c3d4-e5f6-7890-abcd-ef1234567890', 'Miguel Ángel', '+52 55 3333 4444', 'Corte moderno, Degradados'),
  ('b1a2c3d4-e5f6-7890-abcd-ef1234567890', 'Jorge Hernández', '+52 55 5555 6666', 'Barba, Recorte infantil');

-- Insertar servicios de ejemplo
INSERT INTO services (barber_id, locale_id, name, description, price, duration_minutes)
SELECT b.id, b.locale_id, 'Corte de Cabello', 'Corte personalizado según preferencia', 150.00, 30
FROM barbers b WHERE b.name = 'Carlos López';

INSERT INTO services (barber_id, locale_id, name, description, price, duration_minutes)
SELECT b.id, b.locale_id, 'Corte + Barba', 'Corte de cabello con arreglo de barba', 250.00, 45
FROM barbers b WHERE b.name = 'Carlos López';

INSERT INTO services (barber_id, locale_id, name, description, price, duration_minutes)
SELECT b.id, b.locale_id, 'Degradado', 'Corte con degradado fade', 200.00, 40
FROM barbers b WHERE b.name = 'Miguel Ángel';

INSERT INTO services (barber_id, locale_id, name, description, price, duration_minutes)
SELECT b.id, b.locale_id, 'Arreglo de Barba', 'Diseño y arreglo de barba', 100.00, 20
FROM barbers b WHERE b.name = 'Jorge Hernández';

-- Insertar productos de ejemplo
INSERT INTO products (locale_id, name, description, price, stock, category) VALUES
  ('b1a2c3d4-e5f6-7890-abcd-ef1234567890', 'Pomade Clásica', 'Fijación fuerte con brillo', 180.00, 50, 'Cuidado Capilar'),
  ('b1a2c3d4-e5f6-7890-abcd-ef1234567890', 'Aceite para Barba', 'Acondicionador natural', 220.00, 30, 'Barba'),
  ('b1a2c3d4-e5f6-7890-abcd-ef1234567890', 'Shampoo Especial', 'Shampoo para cabello tratado', 160.00, 40, 'Cuidado Capilar');

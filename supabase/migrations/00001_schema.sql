-- Crear extensión UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabla de locales (barberías)
CREATE TABLE locales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  phone VARCHAR(50),
  whatsapp VARCHAR(50),
  website VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de usuarios (todos los roles)
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('superuser', 'admin', 'client')),
  locale_id UUID REFERENCES locales(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de barberos
CREATE TABLE barbers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  locale_id UUID NOT NULL REFERENCES locales(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  specialties TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de servicios
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  barber_id UUID NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  locale_id UUID NOT NULL REFERENCES locales(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 30,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de productos (inventario)
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  locale_id UUID NOT NULL REFERENCES locales(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  stock INT DEFAULT 0,
  category VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de citas
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  locale_id UUID NOT NULL REFERENCES locales(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  barber_id UUID NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  time TIME NOT NULL,
  status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled','confirmed','cancelled','completed')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Perfil de cliente (para seguimiento)
CREATE TABLE client_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  locale_id UUID NOT NULL REFERENCES locales(id) ON DELETE CASCADE,
  phone VARCHAR(50),
  total_visits INT DEFAULT 0,
  last_visit TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, locale_id)
);

-- Índices
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_locale ON users(locale_id);
CREATE INDEX idx_barbers_locale ON barbers(locale_id);
CREATE INDEX idx_services_locale ON services(locale_id);
CREATE INDEX idx_services_barber ON services(barber_id);
CREATE INDEX idx_products_locale ON products(locale_id);
CREATE INDEX idx_appointments_locale ON appointments(locale_id);
CREATE INDEX idx_appointments_client ON appointments(client_id);
CREATE INDEX idx_appointments_barber ON appointments(barber_id);
CREATE INDEX idx_appointments_date ON appointments(date);
CREATE INDEX idx_client_profiles_user ON client_profiles(user_id);
CREATE INDEX idx_client_profiles_locale ON client_profiles(locale_id);

-- Row Level Security
ALTER TABLE locales ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE barbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_profiles ENABLE ROW LEVEL SECURITY;

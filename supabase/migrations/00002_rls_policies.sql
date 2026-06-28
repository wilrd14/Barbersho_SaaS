-- Políticas RLS para locales
CREATE POLICY "superuser_full_access_locales" ON locales
  FOR ALL USING (auth.uid() IN (SELECT id FROM users WHERE role = 'superuser'));

CREATE POLICY "admin_view_own_locale" ON locales
  FOR SELECT USING (auth.uid() IN (SELECT id FROM users WHERE role = 'admin' AND locale_id = locales.id));

CREATE POLICY "clients_view_active_locales" ON locales
  FOR SELECT USING (is_active = true);

-- Políticas RLS para barberos
CREATE POLICY "superuser_full_access_barbers" ON barbers
  FOR ALL USING (auth.uid() IN (SELECT id FROM users WHERE role = 'superuser'));

CREATE POLICY "admin_manage_own_barbers" ON barbers
  FOR ALL USING (
    auth.uid() IN (SELECT id FROM users WHERE role = 'admin' AND locale_id = barbers.locale_id)
  );

CREATE POLICY "clients_view_barbers" ON barbers
  FOR SELECT USING (is_active = true);

-- Políticas RLS para servicios
CREATE POLICY "superuser_full_access_services" ON services
  FOR ALL USING (auth.uid() IN (SELECT id FROM users WHERE role = 'superuser'));

CREATE POLICY "admin_manage_own_services" ON services
  FOR ALL USING (
    auth.uid() IN (SELECT id FROM users WHERE role = 'admin' AND locale_id = services.locale_id)
  );

CREATE POLICY "clients_view_active_services" ON services
  FOR SELECT USING (is_active = true);

-- Políticas RLS para productos
CREATE POLICY "superuser_full_access_products" ON products
  FOR ALL USING (auth.uid() IN (SELECT id FROM users WHERE role = 'superuser'));

CREATE POLICY "admin_manage_own_products" ON products
  FOR ALL USING (
    auth.uid() IN (SELECT id FROM users WHERE role = 'admin' AND locale_id = products.locale_id)
  );

-- Políticas RLS para citas
CREATE POLICY "superuser_full_access_appointments" ON appointments
  FOR ALL USING (auth.uid() IN (SELECT id FROM users WHERE role = 'superuser'));

CREATE POLICY "admin_view_own_appointments" ON appointments
  FOR ALL USING (
    auth.uid() IN (SELECT id FROM users WHERE role = 'admin' AND locale_id = appointments.locale_id)
  );

CREATE POLICY "client_manage_own_appointments" ON appointments
  FOR ALL USING (client_id = auth.uid());

-- Políticas RLS para client_profiles
CREATE POLICY "superuser_full_access_profiles" ON client_profiles
  FOR ALL USING (auth.uid() IN (SELECT id FROM users WHERE role = 'superuser'));

CREATE POLICY "admin_view_own_client_profiles" ON client_profiles
  FOR SELECT USING (
    auth.uid() IN (SELECT id FROM users WHERE role = 'admin' AND locale_id = client_profiles.locale_id)
  );

CREATE POLICY "client_view_own_profile" ON client_profiles
  FOR SELECT USING (user_id = auth.uid());

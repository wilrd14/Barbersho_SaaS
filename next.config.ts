import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Habilita forbidden()/unauthorized() de next/navigation, usados por los
  // guards de autorizacion de src/lib/auth (S1-13) para responder 403 real.
  experimental: {
    authInterrupts: true,
  },
};

export default nextConfig;

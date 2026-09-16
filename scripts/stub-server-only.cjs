// Permite correr scripts de Node (seed, migrate) fuera del bundler de Next.js.
// El paquete "server-only" siempre lanza si se ejecuta en Node plano (fuera de
// Next/webpack, que lo intercepta en tiempo de build); aquí lo neutralizamos
// solo para estos scripts de CLI, nunca para el runtime de la app.
const path = require.resolve("server-only");
require.cache[path] = {
  id: path,
  filename: path,
  loaded: true,
  exports: {},
};

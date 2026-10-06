export default {
  base: './',
  build: { target: 'esnext', rollupOptions: { input: { main: 'index.html', model: 'model.html' } } },
};

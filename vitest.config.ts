import { getViteConfig } from 'astro/config';

export default getViteConfig({
  test: {
    include: ['test/**/*.test.{js,ts}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,astro}'],
      reporter: ['text', 'html'],
    },
  },
});

import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// 2 หน้า: หน้าเว็บปกติ (index.html) และหน้าผู้ดูแล (admin.html → /admin)
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        admin: resolve(import.meta.dirname, 'admin.html'),
      },
    },
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 개발 중에는 Vite가 5173, 서버가 3000이다.
// ★ 프록시로 /socket.io 와 /healthz 를 서버로 넘겨 "오리진이 하나"인 상태를 개발 중에도 유지한다.
//   이렇게 하면 개발 환경과 배포 환경의 동작이 달라지지 않는다.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/socket.io': { target: 'http://localhost:3000', ws: true },
      '/api': { target: 'http://localhost:3000' },
      '/healthz': { target: 'http://localhost:3000' },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});

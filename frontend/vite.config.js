import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // /api 요청은 로컬 Spring Boot 서버로 전달 (CORS 설정 없이 개발 가능)
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
})

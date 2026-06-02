import express from 'express';
import cors from 'cors';
import routes from './routes/index.js';
import { errorMiddleware } from './middlewares/error.middleware.js';
import env from './config/env.js';

const app = express();

const allowedOrigins = [
  env.FRONTEND_ORIGIN,
  'https://premiuminplus.store',
  'https://www.premiuminplus.store',
  'https://premiumin-plus-newdataset-kiuvi5yo7.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
].filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  allowedHeaders: ['Content-Type', 'x-api-key', 'Authorization'],
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
}));

app.use(express.json({ limit: '50mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: true, service: 'premiumin-plus-backend' });
});

app.use('/api', routes);
app.use('/api', (_req, res) => {
  res.status(404).json({ status: false, message: 'API route tidak ditemukan' });
});
app.use(errorMiddleware);

export default app;

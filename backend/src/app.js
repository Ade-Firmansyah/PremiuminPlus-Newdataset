import express from 'express';
import cors from 'cors';
import routes from './routes/index.js';
import { errorMiddleware } from './middlewares/error.middleware.js';

const app = express();

app.use(cors({
  origin: [
    'https://premiuminplus.store',
    'https://www.premiuminplus.store',
  ],
  credentials: true,
  allowedHeaders: ['Content-Type', 'x-api-key', 'Authorization'],
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
}));

app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: true, service: 'premiumin-plus-backend' });
});

app.use('/api', routes);
app.use('/api', (_req, res) => {
  res.status(404).json({ status: false, message: 'API route tidak ditemukan' });
});
app.use(errorMiddleware);

export default app;

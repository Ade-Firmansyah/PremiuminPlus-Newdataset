import express from 'express';
import routes from './routes/index.js';
import { errorMiddleware } from './middlewares/error.middleware.js';
import { rateLimit, securityHeaders } from './middlewares/security.middleware.js';

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(securityHeaders);
app.use(rateLimit());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: true, service: 'premiumin-pluus-backend' });
});

app.use('/api', routes);
app.use(errorMiddleware);

export default app;

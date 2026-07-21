import express from 'express';
import dotenv from 'dotenv';
import { SupabaseAuthRepository } from './infrastructure/SupabaseAuthRepository';
import { AuthUseCases } from './application/AuthUseCases';
import { AuthController } from './interfaces/AuthController';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());

// Dependency Injection Setup
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const authRepository = new SupabaseAuthRepository(supabaseUrl, supabaseKey);
const authUseCases = new AuthUseCases(authRepository);
const authController = new AuthController(authUseCases);

// Routes
app.post('/api/auth/register', authController.register);
app.post('/api/auth/login', authController.login);

app.get('/api/health', (req, res) => {
  res.json({ service: 'auth-service', status: 'ok' });
});

app.listen(port, () => {
  console.log(`auth-service running on port ${port}`);
});

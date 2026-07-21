import express from 'express';
import dotenv from 'dotenv';
import { SupabaseCreditsRepository } from './infrastructure/SupabaseCreditsRepository';
import { CreditsUseCases } from './application/CreditsUseCases';
import { CreditsController } from './interfaces/CreditsController';

dotenv.config();

const app = express();
const port = process.env.PORT || 3007;

app.use(express.json());

// Dependency Injection Setup
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const creditsRepository = new SupabaseCreditsRepository(supabaseUrl, supabaseKey);
const creditsUseCases = new CreditsUseCases(creditsRepository);
const creditsController = new CreditsController(creditsUseCases);

// Routes
app.get('/api/credits/balance', creditsController.getBalance);
app.post('/api/credits/earn', creditsController.earnCredits);
app.post('/api/credits/spend', creditsController.spendCredits); // Internal/Admin only route ideally

app.get('/api/health', (req, res) => {
  res.json({ service: 'credits-service', status: 'ok' });
});

app.listen(port, () => {
  console.log(`credits-service running on port ${port}`);
});

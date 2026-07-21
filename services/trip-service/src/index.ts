import express from 'express';
import dotenv from 'dotenv';
import { SupabaseTripRepository } from './infrastructure/SupabaseTripRepository';
import { TripUseCases } from './application/TripUseCases';
import { TripController } from './interfaces/TripController';

dotenv.config();

const app = express();
const port = process.env.PORT || 3002;

app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const tripRepository = new SupabaseTripRepository(supabaseUrl, supabaseKey);
const tripUseCases = new TripUseCases(tripRepository);
const tripController = new TripController(tripUseCases);

app.post('/api/trips', tripController.createTrip);
app.post('/api/trips/:tripId/join', tripController.joinTrip);
app.post('/api/trips/:tripId/start', tripController.startTrip);
app.post('/api/trips/:tripId/complete', tripController.completeTrip);

app.get('/api/health', (req, res) => {
  res.json({ service: 'trip-service', status: 'ok' });
});

app.listen(port, () => {
  console.log(`trip-service running on port ${port}`);
});

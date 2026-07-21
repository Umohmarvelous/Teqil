import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ service: 'auth-service', status: 'ok' });
});

app.listen(port, () => {
  console.log(name + ' running on port ' + port);
});

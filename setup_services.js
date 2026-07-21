const fs = require('fs');
const path = require('path');

const services = [
  'auth-service',
  'trip-service',
  'payment-service',
  'engagement-service',
  'ad-analytics-service',
  'notification-service'
];

const packageJsonTemplate = (name) => `{
  "name": "${name}",
  "version": "1.0.0",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "ts-node src/index.ts"
  },
  "dependencies": {
    "express": "^4.18.2",
    "amqplib": "^0.10.3",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "typescript": "^5.1.6",
    "ts-node": "^10.9.1",
    "@types/node": "^20.4.5",
    "@types/express": "^4.17.17",
    "@types/amqplib": "^0.10.1"
  }
}`;

const tsConfigTemplate = `{
  "compilerOptions": {
    "target": "es2022",
    "module": "commonjs",
    "rootDir": "./src",
    "outDir": "./dist",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "skipLibCheck": true
  }
}`;

const dockerfileTemplate = `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
`;

const indexTsTemplate = (name) => `import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ service: '${name}', status: 'ok' });
});

app.listen(port, () => {
  console.log(name + ' running on port ' + port);
});
`;

services.forEach(service => {
  const serviceDir = path.join(__dirname, 'services', service);
  
  fs.writeFileSync(path.join(serviceDir, 'package.json'), packageJsonTemplate(service));
  fs.writeFileSync(path.join(serviceDir, 'tsconfig.json'), tsConfigTemplate);
  fs.writeFileSync(path.join(serviceDir, 'Dockerfile'), dockerfileTemplate);
  
  const srcDir = path.join(serviceDir, 'src');
  fs.writeFileSync(path.join(srcDir, 'index.ts'), indexTsTemplate(service));
  
  console.log('Created boilerplate for ' + service);
});

import { config as loadEnv } from 'dotenv';

// Base env first, then developer-local overrides.
loadEnv({ path: '.env' });
loadEnv({ path: '.env.local', override: true });

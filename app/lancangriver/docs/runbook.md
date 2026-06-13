# Lancangriver Runbook

## Start PostGIS

```bash
cd app/lancangriver/docker
docker compose up -d --build
```

## Start service

```bash
cd app/lancangriver/serve
export DATABASE_URL='postgres://lancangriver:lancangriver_dev_password@localhost:5432/lancangriver'
export OPENTOPOGRAPHY_API_KEY='YOUR_KEY'
npm start
```

## Start client

```bash
cd app/lancangriver/client
npm install
npm run dev
```

## Run smoke check

```bash
cd app/lancangriver
bash scripts/smoke.sh
```

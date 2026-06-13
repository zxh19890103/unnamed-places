# Lancangriver Docker (PostGIS)

## Files

- `docker-compose.yml`: Starts a local PostGIS service.
- `postgis/Dockerfile`: PostGIS image definition.
- `postgis/initdb/001-enable-postgis.sql`: Init SQL run on first DB bootstrap.
- `.env.example`: Environment template including `DATABASE_URL`.

## Quick Start

1. Copy env template:

```bash
cd app/lancangriver/docker
cp .env.example .env
```

2. Start PostGIS:

```bash
docker compose up -d --build
```

3. Check status:

```bash
docker compose ps
```

4. Verify PostGIS extension:

```bash
docker compose exec postgis psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT PostGIS_Full_Version();"
```

5. Export app DB URL when running `app/lancangriver/serve`:

```bash
export DATABASE_URL="postgres://lancangriver:lancangriver_dev_password@localhost:5432/lancangriver"
```

6. Test service connectivity from `app/lancangriver/serve`:

```bash
node --input-type=module -e "import('./src/db.js').then(async (m) => { try { await m.queryVectorFeatures([99,19,101,21]); console.log('POSTGIS_CONNECTED=1'); } catch (e) { console.log('POSTGIS_CONNECTED=0'); console.log(e.message); } })"
```

## Notes

- Init scripts run only when volume is first created.
- If you change init scripts after first run, reset volume:

```bash
docker compose down -v
```

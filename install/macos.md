# Install and run on macOS

This guide covers the desktop app and the Lancangriver browser, service, and
optional data pipeline. The current Electron app loads the Lancangriver client:
there is no separate active `app/client` or `app/serve` to install, despite the
older root README describing them.

Run commands in Terminal. Paths below are relative to the repository root
unless a command explicitly changes directory.

## 1. Prerequisites

- Git and the macOS Command Line Tools: run `xcode-select --install` if needed.
- Node.js and npm. Node.js 20.19 or newer is recommended.
- Internet access for package installation and online map data.
- For vector data: Docker Desktop with Docker Compose, running before the
  PostGIS steps below.
- For the optional data pipeline: Python 3.11 or newer with `venv`.
- For DEM downloads: an OpenTopography API key.

Check the installed tools:

```bash
git --version
node --version
npm --version
```

Install missing tools using your preferred macOS installer or package manager.
For example, see [Node.js](https://nodejs.org/) and
[Docker Desktop for Mac](https://docs.docker.com/desktop/setup/install/mac-install/).

## 2. Get the code and install dependencies

```bash
git clone https://github.com/zxh19890103/unnamed-places.git
cd unnamed-places
npm install
npm --prefix app/lancangriver/client install
npm --prefix app/lancangriver/serve install
```

If you already cloned the repository, enter its root instead of cloning again.
Install dependencies separately on the new machine; do not copy `node_modules`
from another Mac.

## 3. Configure and start PostGIS (optional)

PostGIS is needed for vector queries and ingest jobs, but not just to start the
client and service or browse local photos. With Docker Desktop running:

```bash
cd app/lancangriver/docker
docker compose up -d --build
docker compose ps
cd ../../..
```

Wait until the PostGIS container is healthy. Compose reads
[`docker/.env`](../app/lancangriver/docker/.env) if present; its database name,
user, and password must match the connection URL below. The defaults in the
Compose file are shown here. Use your own values if you changed them:

```bash
export DATABASE_URL='postgres://lancangriver:lancangriver_dev_password@localhost:5432/lancangriver'
npm --prefix app/lancangriver/serve run migrate:db
```

Keep `DATABASE_URL` set in the terminal that starts the service. An export only
applies to that shell and its children; repeat it in a new terminal if needed.
Existing database volumes retain their initial credentials. Migrations create
tables but do not populate vector features; use an ingest job or the pipeline
below for data. See the [service guide](../app/lancangriver/serve/README.md).

## 4. Start the desktop app

In a terminal at the repository root, optionally export `DATABASE_URL` as above
and your OpenTopography key for DEM downloads:

```bash
export OPENTOPOGRAPHY_API_KEY='YOUR_KEY'
npm run dev:web
```

Omit the key export if you do not need DEM downloads. Wait for Vite and the
service to start, then open a **second** terminal at the repository root:

```bash
npm start
```

This opens Electron against the development client. Keep both terminals running;
quit Electron and press Ctrl+C in the first terminal to stop. `npm run dev` also
starts all three processes together, but launching Electron after Vite is ready
avoids a startup race.

## 5. Browser-only Lancangriver

Instead of starting Electron, run `npm run dev:web` as above and open
<http://localhost:5173/>. The service normally listens on port 4050:

```bash
curl http://localhost:4050/health
```

The expected response is `{"status":"ok"}`. This checks the service process,
not database connectivity or external tile providers. The client expects the
service at `http://localhost:4050`; avoid changing its port without also updating
the client configuration. Vite may choose a different port if 5173 is occupied;
use its printed URL and check the service's allowed photo-browsing origins.

Use **Photo Settings** to choose local folders. Photo settings are stored
separately for the browser and Electron. On macOS, grant Files and Folders
access to Terminal or the app launching Node when prompted; folder selection
does not bypass macOS permissions. The photo service is intended for local use:
do not expose it to untrusted networks. See the
[client guide](../app/lancangriver/client/README.md#photo-folders) and
[service guide](../app/lancangriver/serve/README.md#photo-folders).

## 6. Optional: install and run the Python pipeline

From the repository root:

```bash
cd app/lancangriver
python3 -m venv pipeline/.venv
pipeline/.venv/bin/python -m pip install -r pipeline/requirements.txt
pipeline/.venv/bin/python -m pytest pipeline/tests/test_corridor_config.py pipeline/tests/test_osm_query_shape.py -q
```

To fetch the configured corridor's OSM data and load it into the migrated
PostGIS database, stay in `app/lancangriver`:

```bash
export DATABASE_URL='postgres://lancangriver:lancangriver_dev_password@localhost:5432/lancangriver'
pipeline/.venv/bin/python -m pipeline.src.ingest.osm_ingest --config pipeline/config/pilot_corridor.json --output-dir pipeline/output/osm
pipeline/.venv/bin/python -m pipeline.src.ingest.load_vector_features --input-dir pipeline/output/osm
```

Use a URL matching your Docker configuration. Ingest requires network access;
loading requires the database and migrations from step 3. The loader above does
not truncate existing features. For configuration and other options, see the
[pipeline guide](../app/lancangriver/pipeline/README.md).

## Troubleshooting

- If port 4050 or 5173 is occupied, stop the conflicting process or adjust
  configuration consistently; check the URLs printed at startup.
- The service loads `.env` and then `.env.local` from its working directory;
  `.env.local` overrides existing environment values. Do not commit API keys.
- Database errors: check Docker Desktop, `docker compose ps`, the database URL,
  and that migrations completed.
- Missing terrain or imagery can indicate an absent API key, network issue, or
  an unavailable external provider.
- For setup details, see the [client](../app/lancangriver/client/README.md),
  [service](../app/lancangriver/serve/README.md), and
  [pipeline](../app/lancangriver/pipeline/README.md) guides.

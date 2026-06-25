import https from "node:https";
import fs from "node:fs";
import { join } from "node:path";
import osmtogeojson from "osmtogeojson";
import _config from "../_config.js";
import { dllock, dllocked, dllockWait, undllock } from "./_lock.js";

export const route = /^\/osm/;
export const pathmatch = "/osm/:z/:x/:y/:w";
export const enabled = true;

/**
 * @type {__types__.Handler<__types__.WithXYZ<{ w: string }>, { bbox: string; node: boolean }>}
 */
export function handler(req, res, url, params, search) {
  const bbox = search.bbox;

  if (!bbox) {
    res.statusCode = 422;
    res.end(
      JSON.stringify({ error: "yes", why: "missing bbox query" }),
      "utf8"
    );
    return;
  }

  const tX = params.x;
  const tY = params.y;
  const tZ = params.z;
  const way = params.w;

  const saveToOsm = join(
    _config.paths.osmdata,
    `./${way}-${tZ}-${tX}-${tY}.json`
  );

  const saveToGeojson = join(
    _config.paths.osmdata,
    `./${way}-${tZ}-${tX}-${tY}.geojson`
  );

  if (dllocked(saveToGeojson)) {
    dllockWait(saveToGeojson, (err_) => {
      if (err_) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "yes" }), "utf8");
      } else {
        fs.createReadStream(saveToGeojson).pipe(res);
      }
    });
    return;
  }

  if (fs.existsSync(saveToGeojson)) {
    res.setHeader("Content-Type", "application/json");
    console.log("[osm] geojson file loaded before: ", saveToGeojson);
    fs.createReadStream(saveToGeojson).pipe(res);
    return;
  }

  dllock(saveToGeojson);
  dllockWait(saveToGeojson, (err_) => {
    if (err_) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: "yes" }), "utf-8");
    } else {
      fs.createReadStream(saveToGeojson).pipe(res);
    }
  });

  const sender = https
    .request(
      {
        method: "POST",
        host: "overpass-api.de",
        path: "/api/interpreter",
        protocol: "https:",
        timeout: 360,
        headers: {
          origin: "https://overpass-api.de",
          referer: "https://overpass-api.de/query_form.html",
          "content-type": "application/x-www-form-urlencoded",
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
        },
      },
      (incoming) => {
        console.log(
          "[osm] incoming,",
          "osm source file will be saved in:",
          saveToOsm
        );

        const writtable = fs.createWriteStream(saveToOsm, "utf8");
        let byteLength = 0;
        let startAt = performance.now();
        let time = 0;
        let seq = 0;

        incoming
          .on("data", (chunk) => {
            byteLength += chunk.byteLength;
            time = performance.now() - startAt;
            time /= 1000;
            console.log(
              `[osm] #${seq++} downloading...`,
              saveToOsm,
              Math.floor(byteLength / 1024) + "kb",
              `; taken ${Math.floor(time)}s`
            );
          })
          .pipe(writtable)
          .on("finish", () => {
            console.log("[osm] finish saved", saveToOsm);
            const json = fs.readFileSync(saveToOsm, "utf8");

            try {
              const jsonO = JSON.parse(json);
              const geojson = osmtogeojson(jsonO, {});
              const geojsonStr = JSON.stringify(geojson);
              fs.writeFileSync(saveToGeojson, geojsonStr, "utf8");
              undllock(saveToGeojson);
            } catch (err_) {
              console.log(">>>>>[osm] error", saveToOsm);
              console.log(json);
              console.log("<<<<<[osm] error", saveToOsm);

              fs.rmSync(saveToOsm);
              undllock(saveToGeojson, err_);
            }

            res.on("error", (ex) => {
              console.log(">>>>>[osm] error", saveToOsm);
              console.log(ex.message);
              console.log("<<<<<[osm] error", saveToOsm);
            });
          })
          .on("close", () => {
            console.log("[osm] close", saveToOsm);
          })
          .on("error", (err_) => {
            console.log(">>>>[osm] error", saveToOsm);
            console.log(err_.message);
            console.log("<<<<[osm] error", saveToOsm);

            undllock(saveToGeojson, err_);
          });
      }
    )
    .on("error", (ex) => {
      console.log(">>>>[osm] error", saveToOsm);
      console.log(ex.message);
      console.log("<<<<[osm] error", saveToOsm);

      undllock(saveToGeojson, ex);
    });

  const us = new URLSearchParams();

  const osmQuery = `
[out:json][timeout:360];
(
relation[${way}](${bbox});
way[${way}](${bbox});
${search.node ? `node[${way}](${bbox});` : ``} 
);
out body;
>;
out skel qt;`;

  us.set("data", osmQuery);

  sender.on("error", (err_) => {
    console.log(">>>>[osm] error");
    console.log(err_.message);
    console.log("<<<<[osm] error");

    undllock(saveToGeojson, err_);
  });

  sender.setTimeout(1000 * 60 * 5, () => {
    undllock(saveToGeojson, "timeout");
  });

  sender.write(us.toString(), "utf8");
  sender.end();
}

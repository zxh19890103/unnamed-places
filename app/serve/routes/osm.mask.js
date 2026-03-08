import fabric from "fabric/node";
import fs from "node:fs";

export const route = /^osm-mask/;
export const enabled = true;
export const pathmatch = "/osm-mask/:z/:x/:y";

/**
 * @type {__types__.Handler<__types__.WithXYZ<{}>>}
 */
export const handler = (req, res, url, params, search) => {
  // 1. Create a static canvas (no interaction needed on server)
  const canvas = new fabric.StaticCanvas(null, { width: 512, height: 512 });

  // 2. Add vector-based elements (useful for GIS labels/symbology)
  const rect = new fabric.Rect({
    left: 100,
    top: 100,
    fill: "red",
    width: 200,
    height: 200,
  });

  const label = new fabric.FabricText("Zone A", {
    left: 110,
    top: 110,
    fontSize: 20,
    fill: "white",
  });

  canvas.add(rect, label);

  canvas.renderAll();

  // 3. Render and export to a Buffer or DataURL
  // This Buffer can be sent to a client to update a THREE.MeshStandardMaterial
  const buffer = canvas.createPNGStream({});

  res.writeHead(200, {
    "Content-Type": "image/png",
    // Optional: Enable CORS so THREE.js can load it from different domains
    "Access-Control-Allow-Origin": "*",
  });

  buffer.on("end", () => {
    canvas.clear();
    canvas.dispose();
  });

  buffer.pipe(res);
};

import * as _public from "./public.js";
import * as _tailwindcss from "./tailwind.js";
import * as _scss from "./scss.js";
import * as _glsl from "./glsl.js";
import * as _html from "./html.js";
import * as _gootile from "./gootile.js";
import * as _gootile_styled from "./gootile.styled.js";
import * as _dem from "./dem.js";
import * as _elevation from "./elevation.js";
import * as _runtime from "./runtime/index.js";
import * as _osm from "./osm.js";
import * as _osm_name from "./osm.name.js";
import * as _dem_aspect from "./dem.aspect.js";
import * as _dem_slope from "./dem.slope.js";
import * as _steal from "./steal.js";
import * as _temp from "./temp.js";

import { pathToRegexp } from "path-to-regexp";
import { parseParamValue } from "./_util.js";

/**
 * @type {__types__.Routes}
 */
const routes = Array.prototype.map.call(
  [
    _runtime,
    _public,
    _tailwindcss,
    _scss,
    _glsl,
    _html,
    _osm,
    _osm_name,
    _gootile,
    _gootile_styled,
    _dem,
    _elevation,
    _dem_slope,
    _dem_aspect,
    _steal,
    _temp,
  ],
  (route) => {
    return { ...route };
  }
);

routes.forEach((route) => {
  if (route.enabled && route.init) {
    route.init();
  }

  if (route.pathmatch) {
    const regx = pathToRegexp(route.pathmatch);
    route.matcher = regx.regexp;
    route.paramsKeys = regx.keys;
  } else {
    route.matcher = route.route;
  }

  if (!route.getParams) {
    route.getParams = routeParamsGetter;
  }

  route._getSearch = routeSearchGetter;
});

/**
 * @this {__types__.Route}
 * @param {URL} url
 * @returns
 */
function routeParamsGetter(url) {
  if (!this.paramsKeys) {
    return {};
  }

  // it's impossible to fail
  console.log("[routeParamsGetter]", url.pathname);
  const match = this.matcher.exec(url.pathname);

  return Object.fromEntries(
    this.paramsKeys.map(({ name }, idx) => {
      return [name, parseParamValue(match[idx + 1])];
    })
  );
}

/**
 * @this {__types__.Route}
 * @param {URL} url
 * @returns
 */
function routeSearchGetter(url) {
  const entries = [...url.searchParams.entries()];
  return Object.fromEntries(
    entries.map((ent) => {
      return [ent[0], parseParamValue(ent[1])];
    })
  );
}

export default routes;

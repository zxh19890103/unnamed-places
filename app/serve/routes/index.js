import * as _public from "./public.js";
import * as _tailwindcss from "./tailwind.js";
import * as _scss from "./scss.js";
import * as _glsl from "./glsl.js";
import * as _html from "./html.js";
import * as _gootile from "./gootile.js";
import * as _dem from "./dem.js";
import * as _elevation from "./elevation.js";
import * as _runtime from "./runtime/index.js";

import { pathToRegexp } from "path-to-regexp";
import { parseParamValue } from "./_util.js";

/**
 * @type {import("./_type.js").Routes}
 */
const routes = Array.prototype.map.call(
  [
    _runtime,
    _public,
    _tailwindcss,
    _scss,
    _glsl,
    _html,
    _gootile,
    _dem,
    _elevation,
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
});

/**
 * @this {import("./_type.js").Route}
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

export default routes;

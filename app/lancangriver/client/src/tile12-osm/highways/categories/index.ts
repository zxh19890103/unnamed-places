import type { HighwayCategoryDefinition } from "../_types.js";
import motorway from "./motorway/index.js";
import trunk from "./trunk/index.js";
import primary from "./primary/index.js";
import secondary from "./secondary/index.js";
import tertiary from "./tertiary/index.js";
import unclassified from "./unclassified/index.js";
import residential from "./residential/index.js";
import living_street from "./living_street/index.js";
import service from "./service/index.js";
import road from "./road/index.js";
import track from "./track/index.js";
import path from "./path/index.js";
import footway from "./footway/index.js";
import cycleway from "./cycleway/index.js";
import pedestrian from "./pedestrian/index.js";
import steps from "./steps/index.js";
import bus_guideway from "./bus_guideway/index.js";
import corridor from "./corridor/index.js";

export const highwayCategories: Record<string, HighwayCategoryDefinition> = {
  motorway,
  trunk,
  primary,
  secondary,
  tertiary,
  unclassified,
  residential,
  living_street,
  service,
  road,
  track,
  path,
  footway,
  cycleway,
  pedestrian,
  steps,
  bus_guideway,
  corridor,
};

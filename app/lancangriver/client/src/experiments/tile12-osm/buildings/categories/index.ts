import type { BuildingCategoryDefinition } from "../_types.js";
import defaultBuilding from "./default/index.js";
import house from "./house/index.js";
import detached from "./detached/index.js";
import bungalow from "./bungalow/index.js";
import hut from "./hut/index.js";
import cabin from "./cabin/index.js";
import residential from "./residential/index.js";
import terrace from "./terrace/index.js";
import apartments from "./apartments/index.js";
import dormitory from "./dormitory/index.js";
import office from "./office/index.js";
import commercial from "./commercial/index.js";
import retail from "./retail/index.js";
import industrial from "./industrial/index.js";
import warehouse from "./warehouse/index.js";
import school from "./school/index.js";
import university from "./university/index.js";
import hospital from "./hospital/index.js";
import hotel from "./hotel/index.js";
import church from "./church/index.js";
import cathedral from "./cathedral/index.js";
import mosque from "./mosque/index.js";
import synagogue from "./synagogue/index.js";
import government from "./government/index.js";

export const buildingCategories: Record<string, BuildingCategoryDefinition> = {
  default: defaultBuilding,
  house,
  detached,
  bungalow,
  hut,
  cabin,
  residential,
  terrace,
  apartments,
  dormitory,
  office,
  commercial,
  retail,
  industrial,
  warehouse,
  school,
  university,
  hospital,
  hotel,
  church,
  cathedral,
  mosque,
  synagogue,
  government,
};

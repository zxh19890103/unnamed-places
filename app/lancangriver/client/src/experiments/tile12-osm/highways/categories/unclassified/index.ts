import * as THREE from "three";
import type { HighwayCategoryDefinition } from "../../_types.js";

const unclassified: HighwayCategoryDefinition = {
  type: "unclassified",
  widthMeters: 4.25,
  classOffset: 0.12,
  getMaterial: null,
};

export default unclassified;

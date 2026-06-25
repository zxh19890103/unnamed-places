import * as THREE from "three";

import chunk_glsl_test from "./test.chunk.glsl";

THREE.ShaderChunk["chunk_glsl_test_pars"] = chunk_glsl_test.chunkShader;

console.log(chunk_glsl_test.chunkShader);

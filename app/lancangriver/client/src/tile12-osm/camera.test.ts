import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { fitCameraToObject } from './camera.js';

describe('fitCameraToObject', () => {
  it('moves farther away for a portrait viewport', () => {
    const object = new THREE.Mesh(new THREE.BoxGeometry(100, 20, 100));
    const landscapeCamera = new THREE.PerspectiveCamera(50, 2, 0.1, 1_000);
    landscapeCamera.position.set(100, 100, 100);
    const portraitCamera = new THREE.PerspectiveCamera(50, 0.5, 0.1, 1_000);
    portraitCamera.position.copy(landscapeCamera.position);

    const landscapeDistance = fitCameraToObject(landscapeCamera, object).distance;
    const portraitDistance = fitCameraToObject(portraitCamera, object).distance;

    expect(portraitDistance).toBeGreaterThan(landscapeDistance);
  });

  it('updates clipping planes around the fitted object', () => {
    const object = new THREE.Mesh(new THREE.BoxGeometry(100, 20, 100));
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1_000);
    camera.position.set(100, 100, 100);

    const fit = fitCameraToObject(camera, object);

    expect(camera.near).toBeGreaterThan(0);
    expect(camera.far).toBeGreaterThan(fit.distance);
    expect(fit.target.length()).toBeLessThan(0.001);
  });
});

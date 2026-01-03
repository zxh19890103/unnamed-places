export default {
  PORT: 1989,
  importmaps: {
    imports: {
      three: "/public/jslibs/three/three.module.js",
      leaflet: "/public/jslibs/leaflet/leaflet-src.esm.js",
      "three/addons/": "https://threejs.org/examples/jsm/",
      react: "https://cdn.jsdelivr.net/npm/react@19.1.0/+esm",
      "react/jsx-runtime":
        "https://cdn.jsdelivr.net/npm/react@19.1.0/jsx-runtime/+esm",
      "react-dom": "https://cdn.jsdelivr.net/npm/react-dom@19.1.0/+esm",
      "react-dom/client":
        "https://cdn.jsdelivr.net/npm/react-dom@19.1.0/client/+esm",
      gsap: "https://cdn.jsdelivr.net/npm/gsap@3.13.0/+esm",
    },
  },
};

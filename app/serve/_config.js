export default {
  projects: ["../client/src"],
  importmaps: {
    imports: {
      three: "/jslibs/three/three.module.js",
      "three/addons/": "https://threejs.org/examples/jsm/",
      react: "https://cdn.jsdelivr.net/npm/react@19.1.0/+esm",
      "react/jsx-runtime":
        "https://cdn.jsdelivr.net/npm/react@19.1.0/jsx-runtime/+esm",
      "react-dom": "https://cdn.jsdelivr.net/npm/react-dom@19.1.0/+esm",
      "react-dom/client":
        "https://cdn.jsdelivr.net/npm/react-dom@19.1.0/client/+esm",
      gsap: "https://cdn.skypack.dev/gsap",
    },
  },
};

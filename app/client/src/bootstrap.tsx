import { createRoot } from "react-dom/client";
import { App } from "./App.js";

const element = document.getElementById("UnnamedPlaces");
createRoot(element, {}).render(<App />);

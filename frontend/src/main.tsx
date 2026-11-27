import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";
import App from "./App";
import { HuntProvider } from "./state/HuntContext";
import { ShopProvider } from "./state/ShopContext";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <HuntProvider>
      <ShopProvider>
        <App />
      </ShopProvider>
    </HuntProvider>
  </StrictMode>,
);

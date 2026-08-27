import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AppStateProvider } from "./state/AppState";
import { ThemeProvider } from "./state/ThemeContext";

// CSS Leaflet обязан идти ДО нашего index.css:
// без него тайлы выглядят блоками, а управление картой разваливается.
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

import "./index.css";

// basename берётся из base в vite.config: на Cloudflare это "/",
// на зеркале GitHub Pages — "/dtp-analitycs/".
const basename = import.meta.env.BASE_URL.replace(/\/$/, "");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <AppStateProvider>
        <BrowserRouter basename={basename}>
          <App />
        </BrowserRouter>
      </AppStateProvider>
    </ThemeProvider>
  </React.StrictMode>,
);

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AppStateProvider } from "./state/AppState";
import { ResearchProvider } from "./state/ResearchContext";
import { LabProvider } from "./state/LabContext";
import { ThemeProvider } from "./state/ThemeContext";

// CSS Leaflet обязан идти ДО нашего index.css:
// без него тайлы выглядят блоками, а управление картой разваливается.
// Шрифты: только кириллица и латиница, только normal, без italic и ext.
// 95 КБ на четыре файла — параллельно с кодом, текст не блокируют.
// Plex выбран за промежуточный характер между редакционной серьёзностью
// и техническим инструментом; Mono — для чисел, координат и n.
import "@fontsource-variable/ibm-plex-sans/wght.css";
import "@fontsource/ibm-plex-mono/400.css";

import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

import "./index.css";

// basename берётся из base в vite.config: на Cloudflare это "/",
// на зеркале GitHub Pages — "/dtp-analytics/".
const basename = import.meta.env.BASE_URL.replace(/\/$/, "");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <AppStateProvider>
        <ResearchProvider>
          <LabProvider>
            <BrowserRouter basename={basename}>
              <App />
            </BrowserRouter>
          </LabProvider>
        </ResearchProvider>
      </AppStateProvider>
    </ThemeProvider>
  </React.StrictMode>,
);

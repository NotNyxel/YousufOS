import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/manrope";
import "@fontsource-variable/noto-kufi-arabic";
import "@fontsource/amiri/400.css";
import "@fontsource/amiri/700.css";
import "@fontsource/amiri-quran/400.css";
import "./index.css";
import App from "./App.jsx";
import { SettingsProvider } from "./lib/settings";
import { NewsProvider } from "./lib/news";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <SettingsProvider>
      <NewsProvider>
        <App />
      </NewsProvider>
    </SettingsProvider>
  </StrictMode>,
);

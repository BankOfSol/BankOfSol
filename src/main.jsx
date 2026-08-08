import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { MeProvider } from "./lib/me-context.jsx";
import "./styles/site.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <MeProvider>
        <App />
      </MeProvider>
    </BrowserRouter>
  </React.StrictMode>
);

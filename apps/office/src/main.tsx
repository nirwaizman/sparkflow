import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import TaskPane from "./TaskPane";

const container = document.getElementById("root");
if (!container) {
  throw new Error("#root element not found");
}

createRoot(container).render(
  <StrictMode>
    <TaskPane />
  </StrictMode>,
);

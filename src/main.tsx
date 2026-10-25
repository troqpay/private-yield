import { createRoot } from "react-dom/client";

import { App } from "./App";
import { installSmokeHooks } from "./devSmoke";

installSmokeHooks();

// No StrictMode: its double-invoked effects would open the SDK's OPFS storage
// twice in development.
createRoot(document.getElementById("root")!).render(<App />);

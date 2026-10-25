import { createRoot } from "react-dom/client";

import { App } from "./App";
import { installDemoSpike } from "./demo/spike";
import { installSmokeHooks } from "./devSmoke";

installSmokeHooks();
installDemoSpike();

// No StrictMode: its double-invoked effects would open the SDK's OPFS storage
// twice in development.
createRoot(document.getElementById("root")!).render(<App />);

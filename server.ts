// Local development / legacy standalone-hosting entrypoint. All actual API
// routes live in src/server/app.ts, shared with the Vercel serverless entry
// (api/index.js, built by `npm run build:api`), so the two never drift apart.
import path from "path";
import { createServer as createViteServer } from "vite";
import { app } from "./src/server/app";

const PORT = Number(process.env.PORT) || 3100;

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const express = (await import("express")).default;
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Ads Manager server running on http://localhost:${PORT}`);
  });
}

startServer();

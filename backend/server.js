const dns = require("dns");
// Set Google DNS to avoid Node.js SRV resolution issue on Windows
try {
  dns.setServers(["8.8.8.8", "8.8.4.4"]);
} catch (e) {
  console.warn("Could not set custom DNS servers, using system default");
}

require("dotenv").config();

const app = require("./app");
const connectDB = require("./config/db");
const getJwtSecret = require("./utils/jwtSecret");
const { startScheduler } = require("./services/scraper/scheduler");

const PORT = process.env.PORT || 5000;

// Connect to Database and start server
const startServer = async () => {
  try {
    getJwtSecret();
    await connectDB();
    startScheduler();
    app.listen(PORT, () => {
      console.log(`HireHub server running in ${process.env.NODE_ENV || "development"} mode on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
};

startServer();
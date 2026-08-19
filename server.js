const express = require("express");
const dotenv = require("dotenv");
const connectDB = require("./src/config/db");
const cors = require("cors");

dotenv.config();

const app = express();

// Middleware
app.use(express.json());
app.use(cors());
app.use(express.json());
// Database
connectDB();

// Routes
app.get("/", (req, res) => {
    res.send("Sharehope API is running 🚀");
});

const userRoutes = require("./src/user/user.routes");

app.use("/api/user", userRoutes);

// Server
const port = process.env.PORT || 8080;

app.listen(port, () => {
    console.log(`App listening on port ${port}`);
});
const express = require("express");
const dotenv = require("dotenv");
const connectDB = require("./src/config/db");
const cors = require("cors");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;

dotenv.config();

const app = express();

// Middleware
app.use(cors({
    origin: "http://localhost:5173",
    credentials: true,
}));
app.use(express.json());

// Database
connectDB();

// Session
app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,

        store: MongoStore.create({
            mongoUrl: process.env.MONGO_URI
        }),

        cookie: {
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000
        }
    })
);

// Routes
app.get("/", (req, res) => {
    res.send("Sharehope API is running 🚀");
});

const authRoutes = require("./src/auth/routes");
const donationRoutes = require("./src/donations/routes");
const adminRoutes = require("./src/admin/routes")

app.use("/api/admin", adminRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/donation",donationRoutes)
// Server
const port = process.env.PORT || 8080;

app.listen(port, () => {
    console.log(`App listening on port ${port}`);
});
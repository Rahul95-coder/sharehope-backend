const express = require("express");
const dotenv = require('dotenv');
const connectDB = require("./src/config/db");
const app = express();
let port = 8080;

app.listen(port, () => {
    console.log(`app listening on port ${port}`);
});


dotenv.config(); 
connectDB();

app.get('/', (req, res) => {
  res.send('Sharehope API is running 🚀');
});
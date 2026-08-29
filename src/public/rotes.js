
const express = require("express");
const { getAllAvailableDonations } = require("./controller");

const router = express.Router();

router.get("/donation",getAllAvailableDonations)

module.exports = router;
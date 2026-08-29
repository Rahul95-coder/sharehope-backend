const express = require("express");
const donorAuthenticate = require("../middleware/donorMiddleware");
const router = express.Router();    
const {createDonation, getAllDonation} = require("./controller")

router.post("/",donorAuthenticate,createDonation)
router.get("/",donorAuthenticate,getAllDonation)


module.exports = router;
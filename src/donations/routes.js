const express = require("express");
const donorAuthenticate = require("../middleware/donorMiddleware");
const { createDonataion, getAllDonation } = require("./controller");
const router = express.Router();    


router.post("/",donorAuthenticate,createDonataion)
router.get("/",donorAuthenticate,getAllDonation)


module.exports = router;
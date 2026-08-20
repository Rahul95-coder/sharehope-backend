const express = require("express");
const { signIn} = require("./controller");
const router = express.Router();    

router.post("/signin",signIn);

module.exports = router;
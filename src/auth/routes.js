const express = require("express");
const { signIn, signUp, signOut, getCurrentUser} = require("./controller");
const router = express.Router();    
const upload = require("../middleware/upload")


router.post("/signin",signIn);
router.post("/signup",upload.single("document"),signUp);
router.post("/signout",signOut);
router.get("/me",getCurrentUser)


module.exports = router;
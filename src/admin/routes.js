
const express = require("express");
const { getAllUser, getDocument, updateUserStatus } = require("./controller");
const router = express.Router();
const adminMiddleware = require("../middleware/adminMiddleware")


router.get("/user",adminMiddleware,getAllUser)
router.get("/user/document/:fileId",adminMiddleware,getDocument)
router.put("/user",adminMiddleware,updateUserStatus)


module.exports = router;
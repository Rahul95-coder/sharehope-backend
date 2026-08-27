const User = require("../user/model")
const mongoose = require("mongoose");
const { getGridFSBucket } = require("../config/gridfs");
const { validateStatus, validateRole } = require("./util");

// @desc   Get document of user for admin
// @route  GET /api/admin/user/document/fileId
const getDocument = async (req, res) => {
    try {
        const fileId = new mongoose.Types.ObjectId(req.params.fileId);

        const bucket = getGridFSBucket();

        const files = await bucket
            .find({ _id: fileId })
            .toArray();

        if (!files.length) {
            return res.status(404).json({
                message: "Document not found"
            });
        }

        res.set("Content-Type", files[0].contentType);

        const downloadStream = bucket.openDownloadStream(fileId);

        downloadStream.on("error", (error) => {
            res.status(500).json({
                message: "Failed to retrieve document"
            });
        });

        downloadStream.pipe(res);

    } catch (error) {
        return res.status(500).json({
            message: "Failed to get document"
        });
    }
};

// @desc   Get all users for admin by status
// @route  GET /api/admin/user?status=status&role=role
const getAllUser = async (req, res) => {
    try {
        const { status , role} = req.query;
        if(!validateRole(role).valid){
             return res.status(validationError.statusCode).json({
                message: validationError.message
            });
        }

        if (!validateStatus(status).valid) {
            return res.status(validationError.statusCode).json({
                message: validationError.message
            });
        }

        const dbUsers = await User.find({
            status: status,
            is_deleted: false
        }).select("-password");


        const users = dbUsers.map((user) => ({
            ...user.toObject(),

            documentUrl: user?.document_id
                ? `http://localhost:8080/api/admin/user/document/${user.document_id}`
                : null
        }));

        return res.status(200).json(users);

    } catch (error) {
        return res.status(500).json({
            message: "Failed to get users",
            error: error.message
        });
    }
};

// @desc   Update user status
// @route  PUT /api/admin/user
// Body 
// status="PENDING" | "VERIFIED" | "REJECTED"
// userId=updating user's id
const updateUserStatus = async (req, res) => {
    try {
        const { userId, status } = req.body;
        if (!userId || userId.trim() === "") {
                 return res.status(404).json({
                message: "Select the user please"
                });
            }
     

        if (validateStatus(status)) {
            return res.status(validationError.statusCode).json({
                message: validationError.message
            });
        }

        const user = await User.findOne({
            _id: userId,
            is_deleted: false
        });

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        user.status = status;

        const updatedUser = await user.save();

        return res.status(200).json({
            message: "User status updated successfully",
            user: updatedUser
        });

    } catch (error) {
        return res.status(500).json({
            message: "Failed to update user status",
            error: error.message
        });
    }
};


module.exports = {
    getDocument,
    getAllUser,
    updateUserStatus
}
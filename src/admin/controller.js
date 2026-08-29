const User = require("../user/model")
const Donation = require("../donations/model")
const mongoose = require("mongoose");
const { getGridFSBucket } = require("../config/gridfs");
const { validateStatus, validateRole, validateDonationStatus } = require("./util");

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
        const validationErrorRole = validateRole(role)
        if(!validationErrorRole.valid){
             return res.status(validationErrorRole.statusCode).json({
                message: validationErrorRole.message
            });
        }

        const validationErrorStatus = validateStatus(status)
        if (!validationErrorStatus.valid) {
            return res.status(validationErrorStatus.statusCode).json({
                message: validationErrorStatus.message
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
     

         const validationErrorStatus = validateStatus(status)
        if (!validationErrorStatus.valid) {
            return res.status(validationErrorStatus.statusCode).json({
                message: validationErrorStatus.message
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



// @desc   Get all donations for admin by status
// @route  GET /api/admin/donation?status=status
const getAllDonations = async (req, res) => {
    try {
        const { status } = req.query;

        const validation = validateDonationStatus(status);

        if (!validation.valid) {
            return res.status(validation.statusCode).json({
                message: validation.message
            });
        }

        const donations = await Donation.find({
            status: status,
            is_deleted: false
        }).populate("donor_id", "name email");

        return res.status(200).json(donations);

    } catch (error) {
        return res.status(500).json({
            message: "Failed to get donations",
            error: error.message
        });
    }
};


// @desc   Update donation status
// @route  PUT /api/admin/donation
//
// Body:
// donationId = donation's id
// status = "AVAILABLE" | "EXPIRED"
const updateDonationStatus = async (req, res) => {
    try {
        const { donationId, status } = req.body;

        if (!donationId || donationId.trim() === "") {
            return res.status(400).json({
                message: "Select the donation please"
            });
        }

        const validation = validateDonationStatus(status);

        if (!validation.valid) {
            return res.status(validation.statusCode).json({
                message: validation.message
            });
        }

        const donation = await Donation.findOne({
            _id: donationId,
            is_deleted: false
        });

        if (!donation) {
            return res.status(404).json({
                message: "Donation not found"
            });
        }

        // Admin can only change a pending donation
        if (donation.status !== "PENDING") {
            return res.status(400).json({
                message: "Only pending donations can be updated"
            });
        }

        donation.status = status;

        const updatedDonation = await donation.save();

        return res.status(200).json({
            message: "Donation status updated successfully",
            donation: updatedDonation
        });

    } catch (error) {
        return res.status(500).json({
            message: "Failed to update donation status",
            error: error.message
        });
    }
};



module.exports = {
    getDocument,
    getAllUser,
    updateUserStatus,
    getAllDonations,
    updateDonationStatus
}
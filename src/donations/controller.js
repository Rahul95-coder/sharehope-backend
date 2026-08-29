const Donation = require("./model")

// @desc    Create a donation
// @route   POST /api/donation
//
// Body:
// title           = string (required)
// category        = "COOKED_FOOD" | "PACKAGED_FOOD" | "GROCERIES" | "FRUITS" | "VEGETABLES" | "BAKERY" | "DAIRY" | "OTHER" (required)
// description     = string (optional)
// qty             = number (required, greater than 0)
// unit            = string (required)
// foodType        = "VEG" | "NON_VEG" (required)
// expiryDateTime  = valid future date and time (required)
const createDonation = async (req, res) => {
    try {
        const {
            title,
            category,
            description,
            qty,
            unit,
            foodType,
            expiryDateTime
        } = req.body;

        // Check logged-in user
        const donorId = req.session.userId;

        if (!donorId) {
            return res.status(401).json({
                message: "You must be logged in to create a donation"
            });
        }

        // Validate title
        if (typeof title !== "string" || title.trim() === "") {
            return res.status(400).json({
                message: "Title is required"
            });
        }

        // Validate category
        if (typeof category !== "string" || category.trim() === "") {
            return res.status(400).json({
                message: "Category is required"
            });
        }

        // Validate food type
        if (typeof foodType !== "string" || foodType.trim() === "") {
            return res.status(400).json({
                message: "Food type is required"
            });
        }

        const normalizedFoodType = foodType.trim().toUpperCase();

        if (!["VEG", "NON_VEG"].includes(normalizedFoodType)) {
            return res.status(400).json({
                message: "Food type must be VEG or NON_VEG"
            });
        }

        // Validate quantity
        if (qty === undefined || qty === null || qty === "") {
            return res.status(400).json({
                message: "Quantity is required"
            });
        }

        if (isNaN(qty) || Number(qty) <= 0) {
            return res.status(400).json({
                message: "Quantity must be greater than 0"
            });
        }

        // Validate unit
        if (typeof unit !== "string" || unit.trim() === "") {
            return res.status(400).json({
                message: "Unit is required"
            });
        }

        // Validate expiry date
        if (!expiryDateTime) {
            return res.status(400).json({
                message: "Expiry date and time is required"
            });
        }

        const expiryDate = new Date(expiryDateTime);

        if (isNaN(expiryDate.getTime())) {
            return res.status(400).json({
                message: "Invalid expiry date and time"
            });
        }

        if (expiryDate <= new Date()) {
            return res.status(400).json({
                message: "Expiry date and time must be in the future"
            });
        }

        // Create donation
        const donation = new Donation({
            title: title.trim(),
            category: category.trim().toUpperCase(),
            description: description?.trim(),
            qty: Number(qty),
            unit: unit.trim(),
            food_type: normalizedFoodType,
            expiry_datetime: expiryDate,
            donor_id: donorId,
            status: "PENDING"
        });

        const savedDonation = await donation.save();

        return res.status(201).json({
            message: "Donation created successfully.",
            donation: {
                id: savedDonation._id,
                title: savedDonation.title,
                category: savedDonation.category,
                description: savedDonation.description,
                qty: savedDonation.qty,
                unit: savedDonation.unit,
                foodType: savedDonation.food_type,
                expiryDateTime: savedDonation.expiry_datetime,
                status: savedDonation.status
            }
        });

    } catch (error) {
        console.log(error.message);

        return res.status(500).json({
            message: "Failed to create donation",
            error: error.message
        });
    }
};


// @desc    Get all donations for donor
// @route   GET /api/donation
//
// Authentication:
// Requires logged-in donor session
//
// Response:
// Returns all non-deleted donations created by the logged-in donor
const getAllDonation = async (req, res) => {
    try {

        const donorId = req.session.userId;

        if (!donorId) {
            return res.status(401).json({
                message: "You must be logged in"
            });
        }

        const donations = await Donation.find({
            donor_id: donorId,
            is_deleted: false
        }).sort({
            createdAt: -1
        });

        return res.status(200).json({
            message: "Donations found successfully.",
            donations
        });

    } catch (error) {

        console.log(error.message);

        return res.status(500).json({
            message: "Failed to get all donations",
            error: error.message
        });
    }
};


module.exports = {
    createDonation,
    getAllDonation
};
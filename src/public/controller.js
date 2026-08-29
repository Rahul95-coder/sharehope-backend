const Donation = require("../donations/model");

// @desc    Get all available donations
// @route   GET /api/donation
//
// Query:
// page=1
// limit=10
// food_type=VEG | NON_VEG
// category=COOKED_FOOD | PACKAGED_FOOD | GROCERIES | FRUITS | VEGETABLES | BAKERY | DAIRY | OTHER

const getAllAvailableDonations = async (req, res) => {
    try {
        let {
            page,
            limit,
            food_type,
            category
        } = req.query;

        // -----------------------------
        // Pagination defaults
        // -----------------------------

        page = Number(page);

        if (!Number.isInteger(page) || page < 1) {
            page = 1;
        }

        limit = Number(limit);

        if (!Number.isInteger(limit) || limit < 1) {
            limit = 10;
        }

        if (limit > 50) {
            limit = 50;
        }


        // -----------------------------
        // Food type
        // -----------------------------

        if (typeof food_type === "string") {
            food_type = food_type.trim().toUpperCase();
        }

        if (!["VEG", "NON_VEG"].includes(food_type)) {
            food_type = "VEG";
        }


        // -----------------------------
        // Category
        // -----------------------------

        const validCategories = [
            "COOKED_FOOD",
            "PACKAGED_FOOD",
            "GROCERIES",
            "FRUITS",
            "VEGETABLES",
            "BAKERY",
            "DAIRY",
            "OTHER"
        ];

        if (typeof category === "string") {
            category = category.trim().toUpperCase();
        }

        // Invalid/missing category = no category filter
        if (!validCategories.includes(category)) {
            category = null;
        }


        // -----------------------------
        // MongoDB filter
        // -----------------------------

        const filter = {
            status: "AVAILABLE",
            is_deleted: false,
            expiry_datetime: {
                $gt: new Date()
            },

            // Default food type = VEG
            food_type: food_type
        };

        // Only add category when valid
        if (category) {
            filter.category = category;
        }


        // -----------------------------
        // Pagination
        // -----------------------------

        const skip = (page - 1) * limit;

        const [donations, total] = await Promise.all([
            Donation.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),

            Donation.countDocuments(filter)
        ]);

        const totalPages = Math.ceil(total / limit);

        return res.status(200).json({
            donations,

            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1
            }
        });

    } catch (error) {

        console.error(error.message);

        return res.status(500).json({
            message: "Failed to get donations",
            error: error.message
        });
    }
};

module.exports = {
    getAllAvailableDonations
};
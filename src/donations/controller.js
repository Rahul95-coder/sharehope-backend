const Donation = require("./model")


//@desc   Create a donations
//@route   POST /api/donation
const createDonataion = async (request, response) => {
    try {
        const {
            title,
            category,
            description,
            qty,
            unit,
            foodType,
            expiryDateTime
        } = request.body;
        console.log(request.session.userId)
        // validations
        // title ,category required,
        if( title === ""){
            return response.status(400).json({
                message:"Title is required"
            })
        }

        // foodType.trim.uppercase == "VEG" or "NONVEG"
        const donation = new Donation({
            title:title,
            description:description,
            category:category,
            qty:qty,
            unit:unit,
            food_type:foodType,
            expiry_datetime:expiryDateTime,
            donor_id:request.session.userId,
            status:"PENDING"
        })

        const savedDonation = await donation.save();
        
         return response.status(201).json({
            message: "Donation created successfully.",
            donation:{
                title: savedDonation.title,
                // savan' work field return
            }
        });
    }catch (error) {
     console.log(error.message)
        return res.status(500).json({
            message: "Failed to create donation",
            error: error.message,
        });   
    }
}

//@desc   Get all donations for donor
//@route   GET /api/donation
const getAllDonation = async (req,res) => {
    try{
        const donorId = req.session.userId;
        const donations = await Donation.find({
            donor_id:donorId,
            is_deleted:false
        })
        return res.status(200).json({
            message:"Donations found successfully.",
            donations:donations
        })
    }catch (error){
        console.log(error.message)
        return res.status(500).json({
            message: "Failed to get all donation",
            error: error.message,
        });   
    }
}
module.exports = {
    createDonataion,
    getAllDonation
}
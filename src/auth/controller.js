const User = require("../user/model")
// @desc   Sign in a  user
//@route   POST /api/auth/signin
const signIn = async (req, res) => {
    try {
        const user = await User.findOne({
            email: req.body.email,
            is_deleted: false
        });
        console.log(user)
        if (user.password === req.body.password) {
            res.status(200).json({ email: user.email, password: user.password, role: user.role, })
        }
    } catch (error) {
        res.status(401).json({ message: 'Failed to signin', error: error.message });
    }
}

// @desc   Sign up a  user
//@route   POST /api/auth/signup
const signUp = async (req, res) => {
    try {
        const { name,
            role,
            email,
            phone,
            password,
            contactPersonName,
            address,
            city,
            state,
            pincode,
            donorType,
            registrationNumber,
        } = req.body;

        const existingUser = await User.findOne({
            is_deleted: false,
            $or: [
                { name: name },
                { email: email },
                { phone: phone }
            ]
        });

        if (existingUser) {
            return res.status(409).json({
                message: "User already exists with this name, email, or phone."
            });
        }

        const user = new User({
            name,
            role,
            email,
            phone,
            password,
            contact_person_name: contactPersonName,
            address,
            city,
            state,
            pincode,
            donor_type: donorType,
            registration_number: registrationNumber
        });

        const savedUser = await user.save();

        return res.status(201).json(savedUser);

    } catch (error) {
        return res.status(500).json({
            message: "Failed to create user",
            error: error.message,
        });
    }


}

module.exports = {
    signIn,
    signUp
}
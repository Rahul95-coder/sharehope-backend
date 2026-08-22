// src/auth/controller.js

const User = require("../user/model")
const bcrypt = require("bcryptjs");
const { getGridFSBucket, uploadFile } = require("../config/gridfs")

// @desc   Sign in a  user
//@route   POST /api/auth/signin
const signIn = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({
            email: email,
            is_deleted: false
        });

        if (!user) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }
        
        const isPasswordCorrect = await bcrypt.compare(
            password,
            user.password
        );

        if (!isPasswordCorrect) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        // Create login session
        req.session.userId = user._id;
        req.session.role = user.role;

        return res.status(200).json({
            message: "Signin successful",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        return res.status(500).json({
            message: "Failed to signin",
            error: error.message
        });
    }
};

//@desc   Sign up a  user
//@route   POST /api/auth/signup
const signUp = async (req, res) => {
    console.log("Request comes for sign up")
    console.log(req.body)
    console.log(req.file)
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
        const hashedPassword = await bcrypt.hash(password, 10);

        const bucket = getGridFSBucket();

        let documentId = null;

        if (role === "NGO") {

            if (!req.file) {
                return res.status(400).json({
                    message: "NGO document is required.",
                });
            }

            const bucket = getGridFSBucket();

            documentId = await uploadFile(bucket, req.file);
        }
        const user = new User({
            name,
            role,
            email,
            phone,
            password: hashedPassword,
            contact_person_name: contactPersonName,
            address,
            city,
            state,
            pincode,
            donor_type: role === "DONOR" ? donorType : null,
            registration_number: role === "NGO" ? registrationNumber : null,
            document_id: documentId
        });

        await user.save();
        return res.status(201).json({ message: "SIgn up successfully, wait for admin verification." });

    } catch (error) {
        console.log(error.message)
        return res.status(500).json({
            message: "Failed to create user",
            error: error.message,
        });
    }


}

//@desc   Logout a  user
//@route   POST /api/auth/signout
const signOut = (req, res) => {
    req.session.destroy((error) => {

        if (error) {
            return res.status(500).json({
                message: "Failed to logout"
            });
        }

        res.clearCookie("connect.sid");

        return res.status(200).json({
            message: "Logout successful"
        });
    });
};

//@desc   Get CUrrent user a  user
//@route   POST /api/auth/me
const getCurrentUser = async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                message: "Not authenticated",
            });
        }

        const user = await User.findOne({
            _id: req.session.userId,
            is_deleted: false,
        }).select("-password");

        if (!user) {
            return res.status(401).json({
                message: "User not found",
            });
        }

        return res.status(200).json({
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        });

    } catch (error) {
        return res.status(500).json({
            message: "Failed to get current user",
        });
    }
};

module.exports = {
    signIn,
    signUp,
    signOut,
    getCurrentUser
}
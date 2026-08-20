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
        if(user.password === req.body.password){
            res.status(200).json({email:user.email,password:user.password,role:user.role,})
        }
    } catch(error){
        res.status(401).json({ message: 'Failed to signin', error: error.message });
    }
}

module.exports = {
    signIn
}
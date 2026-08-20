const User = require("./model")


// @desc    Create a new user
//@route   POST /api/user
const createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const newUser = new User({ name, email, password, role });
    const savedUser = await newUser.save();
    res.status(201).json(savedUser);
  } catch (error) {
    res.status(400).json({ message: 'Failed to create user', error: error.message });
  }
};

const getUser = async(req,res) => {
    try{
        const users =await User.find();
        res.status(200).json(users)
    }catch{
        res.status(500).json({ message: 'Failed to fetch users', error: error.message });
    }
}

module.exports = {
    createUser,
    getUser
}
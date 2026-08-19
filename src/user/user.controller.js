const User = require("./user.model")


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

module.exports = {
    createUser
}
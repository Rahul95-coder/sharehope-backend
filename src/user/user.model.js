// backend/models/Product.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'User name is required'],
            trim: true,
        },
        email: {
            type: String,
            required: [true, 'User email is required'],
            trim: true,
        },
        password: {
            type: String,
            required: [true, 'User password is required'],
        },
        role: {
            type: String,
            required: [true, 'User role is required'],
        }
    },
    {
        timestamps: true, // Automatically adds createdAt and updatedAt fields
    }
);

module.exports = mongoose.model('User', UserSchema);
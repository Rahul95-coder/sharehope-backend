const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      required: true,
      enum: ["DONOR", "NGO", "ADMIN"],
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    contact_person_name: {
      type: String,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ["VERIFIED", "PENDING", "REJECTED"],
      default: "PENDING",
    },

    address: {
      type: String,
      trim: true,
    },

    city: {
      type: String,
      trim: true,
    },

    state: {
      type: String,
      trim: true,
    },

    pincode: {
      type: String,
      trim: true,
    },

    donor_type: {
      type: String,
      trim: true,
    },

    registration_number: {
      type: String,
      trim: true,
    },

    document_key: {
      type: String,
    },

    document_url: {
      type: String,
    },

    is_deleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("User", userSchema);
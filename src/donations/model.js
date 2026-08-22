const mongoose = require("mongoose");

const donationSchema = new mongoose.Schema(
  {
    donor_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    ngo_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
    },

    qty: {
      type: Number,
      required: true,
      min: 0,
    },

    unit: {
      type: String,
      required: true,
      trim: true,
    },

    food_type: {
      type: String,
      required: true,
      enum: ["VEG", "NON_VEG"],
    },

    expiry_datetime: {
      type: Date,
      required: true,
    },

    status: {
      type: String,
      enum: ["PENDING","AVAILABLE", "ACCEPTED", "EXPIRED"],
      default: "PENDING",
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

module.exports = mongoose.model("Donation", donationSchema);
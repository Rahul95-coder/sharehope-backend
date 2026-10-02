const { body } = require('express-validator');
const Donation = require('../models/Donation');

const enums = (path) => Donation.schema.path(path).enumValues;

const futureDate = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error('Expiry date is not a valid date');
  if (d.getTime() <= Date.now()) throw new Error('Expiry date and time must be in the future');
  return true;
};

exports.createDonationValidation = [
  body('title').isString().trim().isLength({ min: 3, max: 120 }).withMessage('Title must be 3-120 characters'),
  body('category').isIn(enums('category')).withMessage('Invalid category'),
  body('quantity').isFloat({ min: 0.1, max: 100000 }).withMessage('Quantity must be between 0.1 and 100000'),
  body('unit').isIn(enums('unit')).withMessage('Invalid unit'),
  body('foodType').optional({ values: 'falsy' }).isIn(enums('foodType')).withMessage('Invalid food type'),
  body('expiryDateTime').isISO8601().withMessage('Expiry date is required').bail().custom(futureDate),
  body('pickupDeadline').optional({ values: 'falsy' }).isISO8601().withMessage('Pickup deadline is not a valid date').bail()
    .custom((value, { req }) => {
      const deadline = new Date(value).getTime();
      if (deadline <= Date.now()) throw new Error('Pickup deadline must be in the future');
      if (req.body.expiryDateTime && deadline > new Date(req.body.expiryDateTime).getTime()) {
        throw new Error('Pickup deadline cannot be after the food expiry time');
      }
      return true;
    }),
  body('storageCondition').optional({ values: 'falsy' }).isIn(enums('storageCondition')).withMessage('Invalid storage condition'),
  body('description').optional({ values: 'falsy' }).isString().isLength({ max: 1000 }).withMessage('Description is too long (max 1000)'),
  body('temperatureGuideline').optional({ values: 'falsy' }).isString().isLength({ max: 300 }).withMessage('Temperature guideline is too long'),
];

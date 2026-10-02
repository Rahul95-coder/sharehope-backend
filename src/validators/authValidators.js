const { body } = require('express-validator');

const DONOR_TYPES = [
  'RESTAURANT', 'HOTEL', 'BAKERY', 'CLOUD_KITCHEN', 'EVENT_ORGANIZER',
  'CANTEEN', 'UNIVERSITY_HOSTEL', 'CORPORATE_CAFETERIA', 'OTHER',
];

// 8-72 chars (bcrypt ignores everything past 72 bytes), at least one letter and one number.
const passwordRules = (field) =>
  body(field)
    .isString().withMessage('Password is required')
    .bail()
    .isLength({ min: 8, max: 72 }).withMessage('Password must be 8-72 characters long')
    .matches(/[A-Za-z]/).withMessage('Password must contain at least one letter')
    .matches(/\d/).withMessage('Password must contain at least one number');

const optionalText = (field, max) =>
  body(field).optional({ values: 'falsy' }).isString().withMessage(`${field} must be text`).bail()
    .isLength({ max }).withMessage(`${field} is too long (max ${max} characters)`);

exports.registerValidation = [
  body('name').isString().trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  body('email').isString().bail().isEmail().withMessage('A valid email is required').bail().normalizeEmail(),
  passwordRules('password'),
  body('role').isIn(['DONOR', 'NGO', 'VOLUNTEER']).withMessage('Invalid role'),
  body('phone').optional({ values: 'falsy' }).isMobilePhone('any').withMessage('Invalid phone number'),
  body('donorType').optional({ values: 'falsy' }).isIn(DONOR_TYPES).withMessage('Invalid donor type'),
  body('address').optional().isObject().withMessage('Address must be an object'),
  optionalText('contactPersonName', 100),
  optionalText('registrationNumber', 60),
  optionalText('organizationDescription', 1000),
  optionalText('mission', 500),
];

exports.loginValidation = [
  body('email').isString().bail().isEmail().withMessage('A valid email is required').bail().normalizeEmail(),
  body('password').isString().notEmpty().withMessage('Password is required').isLength({ max: 128 }),
];

exports.profileValidation = [
  body('name').optional().isString().trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  body('phone').optional({ values: 'falsy' }).isMobilePhone('any').withMessage('Invalid phone number'),
  body('address').optional().isObject().withMessage('Address must be an object'),
  optionalText('contactPersonName', 100),
  optionalText('organizationDescription', 1000),
  optionalText('mission', 500),
  body('transportAvailable').optional().isBoolean().withMessage('transportAvailable must be true or false'),
  body('availability').optional().isArray({ max: 10 }).withMessage('availability must be a list'),
  body('skills').optional().isArray({ max: 20 }).withMessage('skills must be a list'),
  body('preferredCategories').optional().isArray({ max: 20 }).withMessage('preferredCategories must be a list'),
];

exports.changePasswordValidation = [
  body('currentPassword').isString().notEmpty().withMessage('Current password is required'),
  passwordRules('newPassword'),
];

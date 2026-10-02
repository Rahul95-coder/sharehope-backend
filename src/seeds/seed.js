require('../config/env').loadEnv();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { connectDB, disconnectDB, maskUri } = require('../config/db');
const User = require('../models/User');
const Donation = require('../models/Donation');
const Claim = require('../models/Claim');
const VolunteerShift = require('../models/VolunteerShift');
const Notification = require('../models/Notification');
const ImpactRecord = require('../models/ImpactRecord');
const AuditLog = require('../models/AuditLog');
const { calculateImpact } = require('../utils/impactCalculator');

const hasFlag = (name) => process.argv.includes(name);
const targetArg = (process.argv.find((a) => a.startsWith('--target=')) || '').split('=')[1];

const seed = async () => {
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && !hasFlag('--force')) {
    console.error('Refusing to seed: NODE_ENV=production. Demo accounts have publicly known passwords.');
    console.error('If you really intend this, re-run with --force.');
    process.exit(1);
  }

  const { source } = await connectDB({ mode: targetArg });
  console.log(`Seeding ${source.kind.toUpperCase()} database "${source.name}" on ${source.host}`);

  // Anything that is not a local database needs an explicit confirmation flag.
  if (source.kind !== 'local' && !hasFlag('--yes') && !hasFlag('--force')) {
    console.error(`\nThis is a REMOTE (${source.kind}) database. Seeding replaces the demo data in it.`);
    console.error('Real users/donations are NOT touched, but please confirm by re-running with --yes');
    console.error('  e.g.  npm run seed:atlas\n');
    await disconnectDB();
    process.exit(1);
  }

  // Admin credentials
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@sharehope.org';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin@123456';

  // Remove ONLY previously seeded demo data (previous version wiped every collection).
  const seedEmails = [
    adminEmail,
    'rajhans@example.com',
    'swad@example.com',
    'rotibakery@example.com',
    'annapurna@example.com',
    'sahyog@example.com',
    'balshakti@example.com',
    'arjun@example.com',
    'nisha@example.com',
  ];
  const seedUserIds = await User.find({ $or: [{ isSeedData: true }, { email: { $in: seedEmails } }] }).distinct('_id');
  const seedDonationIds = await Donation.find({ $or: [{ isSeedData: true }, { donor: { $in: seedUserIds } }] }).distinct('_id');
  await Promise.all([
    Claim.deleteMany({ $or: [{ donation: { $in: seedDonationIds } }, { ngo: { $in: seedUserIds } }] }),
    ImpactRecord.deleteMany({ $or: [{ donation: { $in: seedDonationIds } }, { donor: { $in: seedUserIds } }] }),
    Notification.deleteMany({ user: { $in: seedUserIds } }),
    AuditLog.deleteMany({ actor: { $in: seedUserIds } }),
    VolunteerShift.deleteMany({ isSeedData: true }),
    Donation.deleteMany({ _id: { $in: seedDonationIds } }),
  ]);
  await User.deleteMany({ _id: { $in: seedUserIds } });
  console.log(`Removed previous demo data (${seedUserIds.length} users, ${seedDonationIds.length} donations).`);

  // Admin creation
  const admin = await User.create({
    name: 'ShareHope Admin',
    email: adminEmail,
    passwordHash: await bcrypt.hash(adminPassword, 12),
    role: 'ADMIN',
    status: 'VERIFIED',
    phone: '9876500001',
    address: { city: 'Ahmedabad', state: 'Gujarat', pincode: '380001' },
    isSeedData: true,
  });
  console.log(`Admin created: ${adminEmail}`);

  // Donors
  const donor1 = await User.create({
    name: 'Rajhans Hotel',
    contactPersonName: 'Rajesh Patel',
    email: 'rajhans@example.com',
    phone: '9876500002',
    passwordHash: await bcrypt.hash('Donor@123', 12),
    role: 'DONOR',
    status: 'VERIFIED',
    donorType: 'HOTEL',
    registrationNumber: 'GJ-FSSAI-2021-001',
    organizationDescription: 'Premium hotel in Ahmedabad serving 500+ guests daily.',
    address: { addressLine: 'SG Highway', city: 'Ahmedabad', state: 'Gujarat', pincode: '380054' },
    verifiedAt: new Date(),
    isSeedData: true,
  });

  const donor2 = await User.create({
    name: 'Swad Catering Services',
    contactPersonName: 'Priya Shah',
    email: 'swad@example.com',
    phone: '9876500003',
    passwordHash: await bcrypt.hash('Donor@123', 12),
    role: 'DONOR',
    status: 'VERIFIED',
    donorType: 'EVENT_ORGANIZER',
    registrationNumber: 'GJ-FSSAI-2022-045',
    organizationDescription: 'Event catering with 10 years experience in Gujarat.',
    address: { addressLine: 'Vastrapur', city: 'Ahmedabad', state: 'Gujarat', pincode: '380015' },
    verifiedAt: new Date(),
    isSeedData: true,
  });

  const donor3 = await User.create({
    name: 'Roti Bakery',
    contactPersonName: 'Mehul Trivedi',
    email: 'rotibakery@example.com',
    phone: '9876500007',
    passwordHash: await bcrypt.hash('Donor@123', 12),
    role: 'DONOR',
    status: 'VERIFIED',
    donorType: 'BAKERY',
    registrationNumber: 'GJ-FSSAI-2023-099',
    organizationDescription: 'Traditional Gujarati bakery in Surat.',
    address: { addressLine: 'Ring Road', city: 'Surat', state: 'Gujarat', pincode: '395002' },
    verifiedAt: new Date(),
    isSeedData: true,
  });

  // NGOs
  const ngo1 = await User.create({
    name: 'Annapurna Trust',
    contactPersonName: 'Dr. Kavita Mehta',
    email: 'annapurna@example.com',
    phone: '9876500004',
    passwordHash: await bcrypt.hash('NGO@123', 12),
    role: 'NGO',
    status: 'VERIFIED',
    registrationNumber: 'GUJ-NGO-2019-0234',
    organizationDescription: 'Feeding underprivileged families in Ahmedabad since 2019.',
    mission: 'No one sleeps hungry in Gujarat.',
    address: { addressLine: 'Maninagar', city: 'Ahmedabad', state: 'Gujarat', pincode: '380008' },
    verifiedAt: new Date(),
    isSeedData: true,
  });

  const ngo2 = await User.create({
    name: 'Sahyog Foundation',
    contactPersonName: 'Ramanbhai Desai',
    email: 'sahyog@example.com',
    phone: '9876500005',
    passwordHash: await bcrypt.hash('NGO@123', 12),
    role: 'NGO',
    status: 'VERIFIED',
    registrationNumber: 'GUJ-NGO-2020-0567',
    organizationDescription: 'Community support organization in Surat helping 1000+ families.',
    mission: 'Building a compassionate community through food security.',
    address: { addressLine: 'Adajan', city: 'Surat', state: 'Gujarat', pincode: '395009' },
    verifiedAt: new Date(),
    isSeedData: true,
  });

  const ngo3 = await User.create({
    name: 'Balshakti NGO',
    contactPersonName: 'Sunita Agrawal',
    email: 'balshakti@example.com',
    phone: '9876500010',
    passwordHash: await bcrypt.hash('NGO@123', 12),
    role: 'NGO',
    status: 'PENDING',
    registrationNumber: 'GUJ-NGO-2024-1234',
    organizationDescription: 'New NGO focusing on child nutrition in rural Gujarat.',
    mission: 'Every child deserves nutritious food.',
    address: { addressLine: 'Gandhinagar Sector 7', city: 'Gandhinagar', state: 'Gujarat', pincode: '382007' },
    isSeedData: true,
  });

  // Volunteers
  const vol1 = await User.create({
    name: 'Arjun Sharma',
    email: 'arjun@example.com',
    phone: '9876500006',
    passwordHash: await bcrypt.hash('Vol@123', 12),
    role: 'VOLUNTEER',
    status: 'VERIFIED',
    address: { city: 'Ahmedabad', state: 'Gujarat', pincode: '380005' },
    availability: ['WEEKEND_MORNING', 'WEEKEND_AFTERNOON'],
    skills: ['DRIVING', 'FOOD_HANDLING'],
    transportAvailable: true,
    reliabilityScore: 95,
    shiftsCompleted: 12,
    totalVolunteerHours: 36,
    isSeedData: true,
  });

  const vol2 = await User.create({
    name: 'Nisha Patel',
    email: 'nisha@example.com',
    phone: '9876500008',
    passwordHash: await bcrypt.hash('Vol@123', 12),
    role: 'VOLUNTEER',
    status: 'VERIFIED',
    address: { city: 'Ahmedabad', state: 'Gujarat', pincode: '380014' },
    availability: ['WEEKDAY_MORNING', 'WEEKDAY_EVENING'],
    skills: ['COOKING', 'PACKING', 'COORDINATION'],
    transportAvailable: false,
    reliabilityScore: 88,
    shiftsCompleted: 8,
    totalVolunteerHours: 24,
    isSeedData: true,
  });

  // Donations
  const now = new Date();

  const d1 = await Donation.create({
    donor: donor1._id,
    title: 'Dal-Bhat-Sabzi Thali (150 portions)',
    category: 'COOKED_FOOD',
    description: 'Fresh Gujarati thali prepared this morning. Includes dal, rice, 2 sabzis, roti and dessert.',
    quantity: 150,
    unit: 'PORTIONS',
    foodType: 'VEG',
    expiryDateTime: new Date(now.getTime() + 4 * 60 * 60 * 1000),
    pickupDeadline: new Date(now.getTime() + 2 * 60 * 60 * 1000),
    status: 'AVAILABLE',
    urgency: 'URGENT',
    estimatedMeals: 150,
    pickupAddress: { addressLine: 'SG Highway, Near Sola', city: 'Ahmedabad', state: 'Gujarat', pincode: '380054' },
    isSeedData: true,
  });

  const d2 = await Donation.create({
    donor: donor2._id,
    title: 'Wedding Surplus - Paneer & Rice',
    category: 'COOKED_FOOD',
    description: 'Surplus from a 300 person wedding event. Well-cooked, hygienic, still warm.',
    quantity: 80,
    unit: 'KG',
    foodType: 'VEG',
    expiryDateTime: new Date(now.getTime() + 6 * 60 * 60 * 1000),
    pickupDeadline: new Date(now.getTime() + 3 * 60 * 60 * 1000),
    status: 'AVAILABLE',
    urgency: 'URGENT',
    estimatedMeals: 320,
    pickupAddress: { addressLine: 'Vastrapur Lake, Event Hall', city: 'Ahmedabad', state: 'Gujarat', pincode: '380015' },
    isSeedData: true,
  });

  const d3 = await Donation.create({
    donor: donor3._id,
    title: 'Fresh Bread & Bakery Items',
    category: 'BAKERY',
    description: 'End-of-day surplus: bread loaves, pav, dinner rolls, cookies.',
    quantity: 25,
    unit: 'KG',
    foodType: 'VEG',
    expiryDateTime: new Date(now.getTime() + 12 * 60 * 60 * 1000),
    pickupDeadline: new Date(now.getTime() + 6 * 60 * 60 * 1000),
    status: 'AVAILABLE',
    urgency: 'NORMAL',
    estimatedMeals: 100,
    pickupAddress: { addressLine: 'Ring Road Bakery', city: 'Surat', state: 'Gujarat', pincode: '395002' },
    isSeedData: true,
  });

  const d4 = await Donation.create({
    donor: donor1._id,
    title: 'Packaged Biscuits & Snacks',
    category: 'PACKAGED_FOOD',
    description: 'Unopened packaged biscuits, namkeen, and juice boxes from mini-bar stock clearance.',
    quantity: 40,
    unit: 'PACKETS',
    foodType: 'VEG',
    expiryDateTime: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    status: 'CLAIMED',
    urgency: 'NORMAL',
    estimatedMeals: 40,
    pickupAddress: { addressLine: 'SG Highway Hotel', city: 'Ahmedabad', state: 'Gujarat', pincode: '380054' },
    claimedBy: ngo1._id,
    claimedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    pickupCode: 'A1B2C3',
    isSeedData: true,
  });

  // Completed donation with impact
  const d5 = await Donation.create({
    donor: donor2._id,
    title: 'Conference Buffet Surplus',
    category: 'COOKED_FOOD',
    description: 'Corporate conference buffet - assorted snacks and meals.',
    quantity: 60,
    unit: 'KG',
    foodType: 'VEG',
    expiryDateTime: new Date(now.getTime() - 1 * 60 * 60 * 1000),
    status: 'COMPLETED',
    urgency: 'EXPIRED',
    estimatedMeals: 240,
    completedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    pickupAddress: { addressLine: 'Vastrapur', city: 'Ahmedabad', state: 'Gujarat', pincode: '380015' },
    claimedBy: ngo2._id,
    isSeedData: true,
  });

  // Expired donation
  const d6 = await Donation.create({
    donor: donor3._id,
    title: 'Yesterday\'s Bread',
    category: 'BAKERY',
    description: 'Day-old bread from Surat bakery.',
    quantity: 10,
    unit: 'KG',
    foodType: 'VEG',
    expiryDateTime: new Date(now.getTime() - 3 * 60 * 60 * 1000),
    status: 'EXPIRED',
    urgency: 'EXPIRED',
    estimatedMeals: 40,
    expiredAt: new Date(now.getTime() - 3 * 60 * 60 * 1000),
    pickupAddress: { addressLine: 'Ring Road', city: 'Surat', state: 'Gujarat', pincode: '395002' },
    isSeedData: true,
  });

  // Claims
  const claim1 = await Claim.create({
    donation: d4._id,
    ngo: ngo1._id,
    status: 'CLAIMED',
    pickupCode: 'A1B2C3',
    estimatedPickupTime: new Date(now.getTime() + 2 * 60 * 60 * 1000),
  });

  const claim2 = await Claim.create({
    donation: d5._id,
    ngo: ngo2._id,
    status: 'COMPLETED',
    pickupCode: 'D4E5F6',
    pickupCodeVerified: true,
    pickupCodeVerifiedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    completedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    receivedQuantity: 58,
    receiverName: 'Ramanbhai Desai',
    actualPickupTime: new Date(now.getTime() - 2 * 60 * 60 * 1000),
  });

  // Impact record from completed donation
  const impact = calculateImpact(58, 'KG');
  await ImpactRecord.create({
    donation: d5._id,
    donor: donor2._id,
    ngo: ngo2._id,
    category: 'COOKED_FOOD',
    quantityKg: impact.kgs,
    estimatedMeals: impact.meals,
    estimatedFamilies: impact.families,
  });

  // Volunteer Shifts
  const shift1 = await VolunteerShift.create({
    title: 'Morning Food Sorting - Annapurna Trust',
    description: 'Help sort and pack donated food items for distribution to 200 families in Maninagar area.',
    activityType: 'FOOD_SORTING',
    location: { addressLine: 'Annapurna Trust HQ, Maninagar', city: 'Ahmedabad', state: 'Gujarat', pincode: '380008' },
    startTime: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000 + 6 * 60 * 60 * 1000),
    endTime: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000 + 10 * 60 * 60 * 1000),
    capacity: 10,
    spotsRemaining: 8,
    urgency: 'HIGH',
    requiredSkills: ['FOOD_HANDLING'],
    estimatedFoodKg: 120,
    createdBy: admin._id,
    assignedVolunteers: [{ volunteer: vol1._id, status: 'REGISTERED' }, { volunteer: vol2._id, status: 'REGISTERED' }],
    isSeedData: true,
  });

  const shift2 = await VolunteerShift.create({
    title: 'Weekend Delivery Run - Surat',
    description: 'Drive and deliver food packages to 5 distribution points across Surat city.',
    activityType: 'DELIVERY',
    location: { addressLine: 'Sahyog Foundation, Adajan', city: 'Surat', state: 'Gujarat', pincode: '395009' },
    startTime: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000 + 7 * 60 * 60 * 1000),
    endTime: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000 + 13 * 60 * 60 * 1000),
    capacity: 5,
    spotsRemaining: 5,
    urgency: 'MEDIUM',
    requiredSkills: ['DRIVING'],
    estimatedFoodKg: 80,
    createdBy: admin._id,
    isSeedData: true,
  });

  const shift3 = await VolunteerShift.create({
    title: 'Bakery Surplus Route - Early Morning',
    description: 'Collect end-of-day bakery surplus from 6 bakeries and deliver to NGOs.',
    activityType: 'BAKERY_SURPLUS_ROUTE',
    location: { addressLine: 'Ring Road Depot', city: 'Surat', state: 'Gujarat', pincode: '395002' },
    startTime: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000 + 5 * 60 * 60 * 1000),
    endTime: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000 + 9 * 60 * 60 * 1000),
    capacity: 3,
    spotsRemaining: 3,
    urgency: 'HIGH',
    requiredSkills: ['DRIVING'],
    estimatedFoodKg: 50,
    createdBy: admin._id,
    isSeedData: true,
  });

  // Notifications
  await Notification.create([
    {
      user: ngo3._id,
      type: 'GENERAL',
      title: 'Welcome to ShareHope!',
      message: 'Thank you for registering. Your account is pending verification. Our team will review your documents within 2-3 business days.',
      isRead: false,
    },
    {
      user: ngo1._id,
      type: 'DONATION_CLAIMED',
      title: 'New Claim Registered',
      message: 'You have successfully claimed "Packaged Biscuits & Snacks" from Rajhans Hotel. Pickup code: A1B2C3',
      link: '/ngo/claims',
      isRead: true,
    },
    {
      user: donor2._id,
      type: 'DONATION_CLAIMED',
      title: 'Donation Claimed!',
      message: 'Sahyog Foundation has claimed your "Conference Buffet Surplus" donation.',
      link: '/donor/claims',
      isRead: true,
    },
    {
      user: vol1._id,
      type: 'SHIFT_REMINDER',
      title: 'Upcoming Shift Reminder',
      message: 'You have a shift "Morning Food Sorting" in 2 days. Please confirm attendance.',
      link: '/volunteer/my-shifts',
      isRead: false,
    },
  ]);

  console.log('\n✅ Seed completed successfully!');
  console.log('\n📋 Test Credentials:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Admin:     ${adminEmail} / ${adminPassword}`);
  console.log('Donor 1:   rajhans@example.com / Donor@123');
  console.log('Donor 2:   swad@example.com / Donor@123');
  console.log('Donor 3:   rotibakery@example.com / Donor@123');
  console.log('NGO 1:     annapurna@example.com / NGO@123');
  console.log('NGO 2:     sahyog@example.com / NGO@123');
  console.log('NGO 3:     balshakti@example.com / NGO@123 (PENDING)');
  console.log('Volunteer: arjun@example.com / Vol@123');
  console.log('Volunteer: nisha@example.com / Vol@123');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  await disconnectDB();
  process.exit(0);
};

seed().catch(async (err) => {
  console.error('Seed failed:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

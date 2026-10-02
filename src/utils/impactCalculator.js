// Impact calculation formulas — adjust multipliers here
const MEALS_PER_KG = 4; // 1 kg of food ≈ 4 meals
const PEOPLE_PER_FAMILY = 4;
const KG_PER_PORTION = 0.25; // for non-weight donations

const calculateMeals = (quantityKg) => Math.round(quantityKg * MEALS_PER_KG);
const calculateFamilies = (meals) => Math.round(meals / PEOPLE_PER_FAMILY);

const normalizeToKg = (quantity, unit) => {
  switch (unit) {
    case 'KG': return quantity;
    case 'GRAMS': return quantity / 1000;
    case 'LITERS': return quantity; // approximate
    case 'PORTIONS': return quantity * KG_PER_PORTION;
    default: return quantity * 0.3; // rough estimate for PIECES, PACKETS etc
  }
};

const calculateImpact = (quantity, unit) => {
  const kgs = normalizeToKg(quantity, unit);
  const meals = calculateMeals(kgs);
  const families = calculateFamilies(meals);
  return { kgs: Math.round(kgs * 10) / 10, meals, families };
};

module.exports = { calculateImpact, calculateMeals, calculateFamilies, normalizeToKg, MEALS_PER_KG };

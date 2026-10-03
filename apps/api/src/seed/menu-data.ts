import type { Temperature } from '@fernleaf/shared';

/**
 * The seeded catalogue: a corporate-lunch kitchen with an Indian menu. Allergen, tag and station
 * names must match reference-data.ts. Costs are what the kitchen spends, in cents (selling prices
 * come from price tiers in M4).
 */

export type SeedOption = {
  name: string;
  costCents: number;
  allergens?: string[];
  tags?: string[];
};

const VEGAN = ['Vegan', 'Vegetarian', 'Dairy-free'];

export const OPTION_SEED: SeedOption[] = [
  // Proteins
  {
    name: 'Paneer',
    costCents: 120,
    allergens: ['Milk'],
    tags: ['Vegetarian', 'Gluten-free', 'Jain'],
  },
  { name: 'Tofu', costCents: 90, allergens: ['Soy'], tags: [...VEGAN, 'Gluten-free', 'Jain'] },
  { name: 'Chickpeas', costCents: 50, tags: [...VEGAN, 'Gluten-free', 'Jain'] },
  { name: 'Chicken tikka', costCents: 150, allergens: ['Milk'], tags: ['Gluten-free', 'Halal'] },
  // Rice and grains
  { name: 'Jeera rice', costCents: 40, tags: [...VEGAN, 'Gluten-free', 'Jain'] },
  { name: 'Brown rice', costCents: 45, tags: [...VEGAN, 'Gluten-free', 'Jain'] },
  { name: 'Basmati rice', costCents: 35, tags: [...VEGAN, 'Gluten-free', 'Jain'] },
  // Breads
  {
    name: 'Roti',
    costCents: 20,
    allergens: ['Cereals containing gluten'],
    tags: [...VEGAN, 'Jain'],
  },
  {
    name: 'Butter naan',
    costCents: 35,
    allergens: ['Cereals containing gluten', 'Milk'],
    tags: ['Vegetarian'],
  },
  {
    name: 'Garlic naan',
    costCents: 40,
    allergens: ['Cereals containing gluten', 'Milk'],
    tags: ['Vegetarian'],
  },
  // Sides
  { name: 'Raita', costCents: 30, allergens: ['Milk'], tags: ['Vegetarian', 'Gluten-free'] },
  { name: 'Mint chutney', costCents: 15, tags: [...VEGAN, 'Gluten-free'] },
  { name: 'Kachumber salad', costCents: 25, tags: [...VEGAN, 'Gluten-free'] },
  { name: 'Papad', costCents: 10, tags: [...VEGAN, 'Gluten-free'] },
  { name: 'Coconut chutney', costCents: 20, tags: [...VEGAN, 'Gluten-free'] },
  { name: 'Sambar', costCents: 30, allergens: ['Mustard'], tags: [...VEGAN, 'Gluten-free'] },
  // Spice level (every option is chosen explicitly, so "Medium" is an option too)
  { name: 'Mild', costCents: 0, tags: [...VEGAN, 'Gluten-free', 'Jain'] },
  { name: 'Medium', costCents: 0, tags: [...VEGAN, 'Gluten-free', 'Jain'] },
  { name: 'Hot', costCents: 0, tags: [...VEGAN, 'Gluten-free', 'Jain'] },
  // Salad dressings and toppings
  { name: 'Lemon herb dressing', costCents: 15, tags: [...VEGAN, 'Gluten-free'] },
  {
    name: 'Yogurt mint dressing',
    costCents: 20,
    allergens: ['Milk'],
    tags: ['Vegetarian', 'Gluten-free'],
  },
  {
    name: 'Toasted almonds',
    costCents: 35,
    allergens: ['Tree nuts'],
    tags: [...VEGAN, 'Gluten-free', 'Jain'],
  },
  {
    name: 'Sesame seeds',
    costCents: 10,
    allergens: ['Sesame'],
    tags: [...VEGAN, 'Gluten-free', 'Jain'],
  },
  // Drink choices
  { name: 'Plain', costCents: 0, tags: ['Vegetarian', 'Gluten-free', 'Jain'] },
  { name: 'Mango', costCents: 25, tags: [...VEGAN, 'Gluten-free', 'Jain'] },
  { name: 'Rose', costCents: 15, tags: [...VEGAN, 'Gluten-free', 'Jain'] },
  { name: 'Sweet', costCents: 0, tags: [...VEGAN, 'Gluten-free', 'Jain'] },
  { name: 'Salted', costCents: 0, tags: [...VEGAN, 'Gluten-free', 'Jain'] },
];

export type SeedGroup = { name: string; min: number; max: number; options: string[] };

export type SeedDish = {
  sku: string;
  name: string;
  description: string;
  temperature: Temperature;
  costCents: number;
  station: string | null;
  allergens?: string[];
  tags?: string[];
  minOrderQty?: number;
  isActive?: boolean;
  groups?: SeedGroup[];
};

const SPICE: SeedGroup = {
  name: 'Spice level',
  min: 1,
  max: 1,
  options: ['Mild', 'Medium', 'Hot'],
};
const RICE: SeedGroup = {
  name: 'Choose your rice',
  min: 1,
  max: 1,
  options: ['Jeera rice', 'Brown rice', 'Basmati rice'],
};
const RICE_OR_BREAD: SeedGroup = {
  name: 'Rice or bread',
  min: 1,
  max: 1,
  options: ['Jeera rice', 'Basmati rice', 'Roti', 'Butter naan', 'Garlic naan'],
};
const BREAD: SeedGroup = {
  name: 'Choose your bread',
  min: 1,
  max: 1,
  options: ['Roti', 'Butter naan', 'Garlic naan'],
};
const SIDES: SeedGroup = {
  name: 'Add sides',
  min: 0,
  max: 2,
  options: ['Raita', 'Mint chutney', 'Kachumber salad', 'Papad'],
};

export const DISH_SEED: SeedDish[] = [
  // ─── Bowls ─────
  {
    sku: 'BWL-PTK-01',
    name: 'Paneer Tikka Rice Bowl',
    description: 'Tandoor-charred paneer tikka with peppers and onions over your choice of rice.',
    temperature: 'HOT',
    costCents: 310,
    station: 'Tandoor',
    allergens: ['Milk'],
    tags: ['Vegetarian', 'Gluten-free'],
    groups: [RICE, SIDES, SPICE],
  },
  {
    sku: 'BWL-BYO-01',
    name: 'Build-Your-Own Protein Bowl',
    description:
      'Pick a protein and a rice, add sides. Finished with pickled onions and coriander.',
    temperature: 'HOT',
    costCents: 180,
    station: 'Curry',
    tags: [...VEGAN, 'Gluten-free'],
    groups: [
      {
        name: 'Choose your protein',
        min: 1,
        max: 1,
        options: ['Paneer', 'Tofu', 'Chickpeas', 'Chicken tikka'],
      },
      RICE,
      SIDES,
      SPICE,
    ],
  },
  {
    sku: 'BWL-RJC-01',
    name: 'Rajma Chawal Bowl',
    description: 'Slow-cooked Punjabi kidney bean curry with rice. Comfort in a bowl.',
    temperature: 'HOT',
    costCents: 210,
    station: 'Curry',
    tags: [...VEGAN, 'Gluten-free'],
    groups: [RICE, SIDES],
  },
  // ─── Plates ─────
  {
    sku: 'PLT-CHL-01',
    name: 'Amritsari Chole Plate',
    description: 'Dark, tangy chickpea curry with onion salad and your choice of bread.',
    temperature: 'HOT',
    costCents: 220,
    station: 'Curry',
    tags: [...VEGAN],
    groups: [BREAD, SIDES],
  },
  {
    sku: 'PLT-BCH-01',
    name: 'Butter Chicken Plate',
    description: 'Tandoori chicken in a silky tomato, butter and cashew gravy.',
    temperature: 'HOT',
    costCents: 360,
    station: 'Curry',
    allergens: ['Milk', 'Tree nuts'],
    tags: ['Gluten-free', 'Halal'],
    groups: [RICE_OR_BREAD, SIDES],
  },
  {
    sku: 'PLT-DLM-01',
    name: 'Dal Makhani Plate',
    description: 'Black lentils simmered overnight with butter and cream.',
    temperature: 'HOT',
    costCents: 230,
    station: 'Curry',
    allergens: ['Milk'],
    tags: ['Vegetarian', 'Gluten-free'],
    groups: [RICE_OR_BREAD, SIDES],
  },
  {
    sku: 'PLT-PLK-01',
    name: 'Palak Paneer Plate',
    description: 'Paneer cubes in a garlicky spinach gravy.',
    temperature: 'HOT',
    costCents: 260,
    station: 'Curry',
    allergens: ['Milk'],
    tags: ['Vegetarian', 'Gluten-free'],
    groups: [RICE_OR_BREAD, SIDES],
  },
  {
    sku: 'THL-JAN-01',
    name: 'Jain Thali',
    description:
      'No onion, garlic or root vegetables: dal, sabzi of the day, paneer, rice, two rotis and a sweet.',
    temperature: 'HOT',
    costCents: 300,
    station: 'Curry',
    allergens: ['Milk', 'Cereals containing gluten'],
    tags: ['Vegetarian', 'Jain'],
  },
  {
    sku: 'BIR-VEG-01',
    name: 'Vegetable Biryani',
    description: 'Dum-cooked basmati with vegetables, saffron and fried onions.',
    temperature: 'HOT',
    costCents: 250,
    station: 'Curry',
    allergens: ['Milk'],
    tags: ['Vegetarian', 'Gluten-free'],
    groups: [SIDES],
  },
  {
    sku: 'BIR-CHK-01',
    name: 'Chicken Biryani',
    description: 'Hyderabadi-style dum biryani with marinated chicken.',
    temperature: 'HOT',
    costCents: 340,
    station: 'Curry',
    allergens: ['Milk'],
    tags: ['Gluten-free', 'Halal'],
    groups: [SIDES],
  },
  // ─── Wraps ─────
  {
    sku: 'WRP-PNR-01',
    name: 'Paneer Kathi Roll',
    description: 'Paneer tikka, onions and mint chutney rolled in a flaky paratha.',
    temperature: 'HOT',
    costCents: 220,
    station: 'Grill',
    allergens: ['Milk', 'Cereals containing gluten'],
    tags: ['Vegetarian'],
    groups: [SPICE],
  },
  {
    sku: 'WRP-CHK-01',
    name: 'Chicken Tikka Wrap',
    description: 'Chicken tikka, crunchy salad and garlic mayo in a wholewheat wrap.',
    temperature: 'HOT',
    costCents: 260,
    station: 'Grill',
    allergens: ['Milk', 'Cereals containing gluten', 'Eggs'],
    tags: ['Halal'],
    groups: [SPICE],
  },
  // ─── Salads ─────
  {
    sku: 'SAL-QCP-01',
    name: 'Quinoa Chickpea Salad',
    description: 'Quinoa, chickpeas, cucumber, tomato and herbs with your choice of dressing.',
    temperature: 'COLD',
    costCents: 240,
    station: 'Cold & Salad',
    tags: [...VEGAN, 'Gluten-free'],
    groups: [
      {
        name: 'Dressing',
        min: 1,
        max: 1,
        options: ['Lemon herb dressing', 'Yogurt mint dressing'],
      },
      { name: 'Toppings', min: 0, max: 2, options: ['Toasted almonds', 'Sesame seeds'] },
    ],
  },
  {
    sku: 'SAL-SPR-01',
    name: 'Sprouts Chaat Salad',
    description: 'Moong sprouts, pomegranate, onion and tomato with chaat masala and lime.',
    temperature: 'COLD',
    costCents: 150,
    station: 'Cold & Salad',
    tags: [...VEGAN, 'Gluten-free'],
  },
  // ─── Breakfast ─────
  {
    sku: 'BRK-DSA-01',
    name: 'Masala Dosa',
    description: 'Crisp rice and lentil crêpe filled with spiced potato.',
    temperature: 'HOT',
    costCents: 170,
    station: 'Grill',
    tags: [...VEGAN, 'Gluten-free'],
    groups: [
      {
        name: 'Served with',
        min: 1,
        max: 2,
        options: ['Coconut chutney', 'Sambar', 'Mint chutney'],
      },
    ],
  },
  {
    sku: 'BRK-PHA-01',
    name: 'Poha',
    description: 'Flattened rice with peanuts, curry leaves and a squeeze of lime.',
    temperature: 'HOT',
    costCents: 110,
    station: 'Curry',
    allergens: ['Peanuts'],
    tags: [...VEGAN, 'Gluten-free'],
  },
  {
    sku: 'BRK-APR-01',
    name: 'Aloo Paratha',
    description: 'Wholewheat flatbread stuffed with spiced potato, with butter.',
    temperature: 'HOT',
    costCents: 140,
    station: 'Tandoor',
    allergens: ['Cereals containing gluten', 'Milk'],
    tags: ['Vegetarian'],
    groups: [{ name: 'Add sides', min: 0, max: 2, options: ['Raita', 'Mint chutney'] }],
  },
  // ─── Snacks and desserts ─────
  {
    sku: 'SNK-SMS-01',
    name: 'Mini Samosa',
    description: 'Cocktail-size potato and pea samosas with tamarind chutney. Minimum 4 per order.',
    temperature: 'HOT',
    costCents: 30,
    station: 'Bakery',
    allergens: ['Cereals containing gluten'],
    tags: [...VEGAN],
    minOrderQty: 4,
  },
  {
    sku: 'DES-GLB-01',
    name: 'Gulab Jamun',
    description: 'Two warm milk dumplings soaked in cardamom syrup.',
    temperature: 'HOT',
    costCents: 70,
    station: 'Bakery',
    allergens: ['Milk', 'Cereals containing gluten'],
    tags: ['Vegetarian'],
  },
  {
    sku: 'DES-PHR-01',
    name: 'Mango Phirni',
    description: 'Chilled ground-rice pudding with Alphonso mango and pistachio.',
    temperature: 'COLD',
    costCents: 90,
    station: 'Cold & Salad',
    allergens: ['Milk', 'Tree nuts'],
    tags: ['Vegetarian', 'Gluten-free'],
  },
  // ─── Drinks ─────
  {
    sku: 'DRK-LSI-01',
    name: 'Lassi',
    description: 'Thick churned yogurt drink.',
    temperature: 'COLD',
    costCents: 60,
    station: 'Cold & Salad',
    allergens: ['Milk'],
    tags: ['Vegetarian', 'Gluten-free'],
    groups: [{ name: 'Flavour', min: 1, max: 1, options: ['Plain', 'Mango', 'Rose'] }],
  },
  {
    sku: 'DRK-LIM-01',
    name: 'Fresh Lime Soda',
    description: 'Freshly squeezed lime with soda.',
    temperature: 'COLD',
    costCents: 30,
    station: 'Cold & Salad',
    tags: [...VEGAN, 'Gluten-free', 'Jain'],
    groups: [{ name: 'Style', min: 1, max: 1, options: ['Sweet', 'Salted'] }],
  },
  // ─── Inactive (deactivated: kept for past orders, can't be ordered) ─────
  {
    sku: 'DSH-SAG-01',
    name: 'Sarson da Saag',
    description: 'Slow-cooked mustard greens finished with white butter.',
    temperature: 'HOT',
    costCents: 240,
    station: 'Curry',
    allergens: ['Milk', 'Mustard'],
    tags: ['Vegetarian', 'Gluten-free'],
    isActive: false,
    groups: [BREAD],
  },
];

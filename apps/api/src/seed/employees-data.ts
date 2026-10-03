/**
 * Seeded employees per company (by company name). The first listed is the company owner.
 * Allergy and diet names must match reference-data.ts. Flags: A = can choose address,
 * T = can change delivery time, P = can change packaging.
 */
export type SeedEmployee = {
  name: string;
  flags?: string;
  allergies?: string[];
  diet?: string[];
  phone?: string;
};

export const EMPLOYEE_SEED: Record<string, SeedEmployee[]> = {
  'Northwind Analytics': [
    { name: 'Priya Sharma', flags: 'ATP', diet: ['Vegetarian'], phone: '+91 98450 10001' },
    { name: 'Arjun Mehta', flags: 'A', allergies: ['Peanuts'] },
    { name: 'Kavya Iyer', diet: ['Vegan'] },
    { name: 'Rohan Gupta', flags: 'T' },
    { name: 'Ananya Reddy', allergies: ['Milk'], diet: ['Vegetarian'] },
    { name: 'Vikram Nair', flags: 'AP', diet: ['Halal'] },
    { name: 'Sneha Pillai', allergies: ['Cereals containing gluten'], diet: ['Gluten-free'] },
    { name: 'Aditya Joshi' },
    { name: 'Meghna Bose', diet: ['Jain', 'Vegetarian'] },
    { name: 'Karthik Subramanian', allergies: ['Tree nuts'] },
    { name: 'Ishita Kapoor', flags: 'A' },
    { name: 'Nikhil Verma', diet: ['Vegetarian'] },
  ],
  'Brightline Labs': [
    { name: 'Rahul Menon', flags: 'ATP' },
    { name: 'Tanvi Desai', diet: ['Vegan'], allergies: ['Sesame'] },
    { name: 'Siddharth Rao', flags: 'T' },
    { name: 'Pooja Hegde', diet: ['Vegetarian'] },
    { name: 'Farah Khan', diet: ['Halal'] },
    { name: 'Neel Banerjee', allergies: ['Eggs'] },
  ],
  'Kestrel Finance': [
    { name: 'Sneha Kulkarni', flags: 'ATP', diet: ['Vegetarian'] },
    { name: 'Amit Saxena', flags: 'A' },
    { name: 'Divya Krishnan', allergies: ['Milk', 'Peanuts'] },
    { name: 'Harsh Agarwal', diet: ['Jain', 'Vegetarian'] },
    { name: 'Lakshmi Narayan', diet: ['Vegetarian'] },
    { name: 'Manish Tiwari', flags: 'T' },
    { name: 'Ritika Malhotra', diet: ['Gluten-free'], allergies: ['Cereals containing gluten'] },
    { name: 'Sameer Qureshi', diet: ['Halal'] },
    { name: 'Nandini Rao' },
    { name: 'Gaurav Chauhan', flags: 'P' },
  ],
  'Monsoon Studio': [
    { name: 'Farhan Sheikh', flags: 'ATP' },
    { name: 'Aisha Thomas', diet: ['Vegan'] },
    { name: 'Dev Patel', allergies: ['Soy'] },
    { name: 'Riya Sen', diet: ['Vegetarian'] },
    { name: 'Kabir Ahuja' },
  ],
  'Tidewater Logistics': [
    { name: 'Vikram Iyer', flags: 'ATP' },
    { name: 'Suresh Babu', flags: 'A', diet: ['Vegetarian'] },
    { name: 'Geeta Rawat' },
    { name: 'Imran Siddiqui', diet: ['Halal'] },
    { name: 'Lalitha Krishnamurthy', diet: ['Vegetarian'], allergies: ['Mustard'] },
    { name: 'Prakash Yadav', flags: 'T' },
    { name: 'Deepa Menon', allergies: ['Crustaceans'] },
    { name: 'Ravi Shankar', flags: 'A' },
    { name: 'Swati Jain', diet: ['Jain', 'Vegetarian'] },
    { name: 'Anil Kumar' },
  ],
  'Old Mill Coworking': [
    { name: 'Leela Das', flags: 'ATP' },
    { name: 'Joseph Mathew' },
    { name: 'Shalini Ghosh', diet: ['Vegetarian'] },
  ],
};

/** "Priya Sharma" + "northwind.example" → "priya.sharma@northwind.example" */
export function seedEmail(name: string, domain: string): string {
  return `${name
    .toLowerCase()
    .replace(/[^a-z ]/g, '')
    .trim()
    .replace(/\s+/g, '.')}@${domain}`;
}

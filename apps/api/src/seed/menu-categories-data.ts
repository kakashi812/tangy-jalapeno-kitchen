/** Seeded menu: categories in display order with dish SKUs in order (decisions 20, 21). */
export const CATEGORY_SEED: {
  name: string;
  isActive?: boolean;
  secretCode?: string;
  skus: string[];
}[] = [
  { name: 'Bestsellers', skus: ['PLT-BCH-01', 'BWL-PTK-01', 'BIR-CHK-01', 'BRK-DSA-01'] },
  { name: 'Bowls', skus: ['BWL-PTK-01', 'BWL-BYO-01', 'BWL-RJC-01'] },
  {
    name: 'Plates & Thalis',
    skus: ['PLT-BCH-01', 'PLT-PLK-01', 'PLT-DLM-01', 'PLT-CHL-01', 'THL-JAN-01', 'DSH-SAG-01'],
  },
  { name: 'Biryani', skus: ['BIR-CHK-01', 'BIR-VEG-01'] },
  { name: 'Wraps & Rolls', skus: ['WRP-PNR-01', 'WRP-CHK-01'] },
  { name: 'Salads', skus: ['SAL-QCP-01', 'SAL-SPR-01'] },
  { name: 'Breakfast', skus: ['BRK-DSA-01', 'BRK-PHA-01', 'BRK-APR-01'] },
  { name: 'Snacks & Desserts', skus: ['SNK-SMS-01', 'DES-GLB-01'] },
  { name: 'Drinks', skus: ['DRK-LSI-01', 'DRK-LIM-01'] },
  // Deactivated category: kept for later, not shown on any menu.
  { name: 'Weekend Brunch', isActive: false, skus: ['BRK-APR-01', 'BRK-DSA-01'] },
  // Secret: not listed; opened with its access code.
  { name: "Chef's Specials", secretCode: 'CHEF2026', skus: ['DES-PHR-01', 'BWL-PTK-01'] },
];

/** What each company doesn't see. */
export const HIDING_SEED: {
  company: string;
  categories?: string[];
  items?: { category: string; sku: string }[];
}[] = [
  { company: 'Tidewater Logistics', categories: ['Breakfast'] },
  {
    company: 'Kestrel Finance',
    items: [
      { category: 'Biryani', sku: 'BIR-CHK-01' },
      { category: 'Bestsellers', sku: 'BIR-CHK-01' },
    ],
  },
];

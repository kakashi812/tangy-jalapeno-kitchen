/**
 * Seeded client companies. Domains use the reserved `.example` TLD, so they look real but can never
 * belong to an actual organisation. Addresses are fictional (Bengaluru; the kitchen is in IST).
 */
export type SeedCompany = {
  name: string;
  domains: string[];
  tier: string | null; // null = default tier
  isActive?: boolean;
  billing: { name: string; email: string; phone: string };
  workingDays?: number[];
  deliveryTime: string; // HH:mm
  dispatchLeadMinutes: number;
  packaging: string;
  driver: string | null; // staff email
  driverInstructions: string;
  addresses: {
    label: string;
    line1: string;
    line2?: string;
    city: string;
    postcode: string;
    deliveryNotes?: string;
  }[];
  holidays?: { name: string; startDate: string; endDate: string }[];
};

export const COMPANY_SEED: SeedCompany[] = [
  {
    name: 'Northwind Analytics',
    domains: ['northwind.example', 'northwind-analytics.example'],
    tier: 'Enterprise',
    billing: { name: 'Anita Rao', email: 'accounts@northwind.example', phone: '+91 80 4000 1100' },
    deliveryTime: '12:30',
    dispatchLeadMinutes: 60,
    packaging: 'Individually labelled',
    driver: 'driver@test.com',
    driverInstructions:
      'Use the service lift. Hand over at the 4th floor pantry, ask for the facilities desk.',
    addresses: [
      {
        label: 'HQ, Embassy Tech Square',
        line1: 'Tower B, 4th floor',
        line2: 'Outer Ring Road, Kadubeesanahalli',
        city: 'Bengaluru',
        postcode: '560103',
        deliveryNotes: 'Security needs the order number at gate 2.',
      },
      {
        label: 'Koramangala studio',
        line1: '17, 5th Cross, 6th Block',
        city: 'Bengaluru',
        postcode: '560095',
      },
    ],
    holidays: [{ name: 'Annual offsite', startDate: '2026-11-19', endDate: '2026-11-20' }],
  },
  {
    name: 'Brightline Labs',
    domains: ['brightline.example'],
    tier: 'Partner',
    billing: {
      name: 'Rahul Menon',
      email: 'finance@brightline.example',
      phone: '+91 80 4111 2200',
    },
    deliveryTime: '13:00',
    dispatchLeadMinutes: 45,
    packaging: 'Eco box',
    driver: 'driver@test.com',
    driverInstructions: 'Reception on the ground floor signs for deliveries.',
    addresses: [
      {
        label: 'Indiranagar office',
        line1: '211, 100 Feet Road',
        line2: 'HAL 2nd Stage',
        city: 'Bengaluru',
        postcode: '560038',
      },
    ],
  },
  {
    name: 'Kestrel Finance',
    domains: ['kestrelfinance.example'],
    tier: null,
    billing: {
      name: 'Sneha Kulkarni',
      email: 'ap@kestrelfinance.example',
      phone: '+91 80 4222 3300',
    },
    workingDays: [1, 2, 3, 4, 5, 6],
    deliveryTime: '12:00',
    dispatchLeadMinutes: 60,
    packaging: 'Standard box',
    driver: 'ravi.driver@test.com',
    driverInstructions: 'Deliver to the trading floor pantry; call the floor manager on arrival.',
    addresses: [
      {
        label: 'MG Road tower',
        line1: 'Prestige Meridian 1, 9th floor',
        line2: '29 MG Road',
        city: 'Bengaluru',
        postcode: '560001',
      },
      {
        label: 'Whitefield ops centre',
        line1: 'ITPL Main Road, Block C',
        city: 'Bengaluru',
        postcode: '560066',
        deliveryNotes: 'Loading bay at the back.',
      },
    ],
  },
  {
    name: 'Monsoon Studio',
    domains: ['monsoonstudio.example'],
    tier: 'Pilot programme',
    billing: {
      name: 'Farhan Sheikh',
      email: 'hello@monsoonstudio.example',
      phone: '+91 80 4333 4400',
    },
    deliveryTime: '13:30',
    dispatchLeadMinutes: 60,
    packaging: 'Eco box',
    driver: null,
    driverInstructions: 'Small team: leave the bag at the front desk.',
    addresses: [
      {
        label: 'Jayanagar loft',
        line1: '42, 11th Main, 4th Block',
        city: 'Bengaluru',
        postcode: '560011',
      },
    ],
  },
  {
    name: 'Tidewater Logistics',
    domains: ['tidewater.example'],
    tier: 'Enterprise',
    billing: { name: 'Vikram Iyer', email: 'billing@tidewater.example', phone: '+91 80 4444 5500' },
    deliveryTime: '12:30',
    dispatchLeadMinutes: 75,
    packaging: 'Individually labelled',
    driver: 'meera.driver@test.com',
    driverInstructions: 'Two drops on the same campus; the warehouse canteen is at gate 3.',
    addresses: [
      {
        label: 'Head office',
        line1: 'Bagmane Constellation, Block 3',
        city: 'Bengaluru',
        postcode: '560048',
      },
      {
        label: 'Hosur Road warehouse',
        line1: 'Plot 8, Electronic City Phase 1',
        city: 'Bengaluru',
        postcode: '560100',
        deliveryNotes: 'Canteen at gate 3, not the main gate.',
      },
    ],
  },
  {
    name: 'Old Mill Coworking',
    domains: ['oldmill.example'],
    tier: null,
    isActive: false,
    billing: { name: 'Leela Das', email: 'admin@oldmill.example', phone: '+91 80 4555 6600' },
    deliveryTime: '12:30',
    dispatchLeadMinutes: 60,
    packaging: 'Standard box',
    driver: null,
    driverInstructions: '',
    addresses: [
      { label: 'Main building', line1: '5, Lavelle Road', city: 'Bengaluru', postcode: '560001' },
    ],
  },
];

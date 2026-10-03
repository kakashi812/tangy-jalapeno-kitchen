/**
 * Chosen free-licence photos (Unsplash licence: free to use, no attribution required; credited
 * anyway). Each was checked visually against its dish. Only images.unsplash.com URLs (never the paid
 * Unsplash+ library).
 */
export const DISH_PHOTO_SOURCES: {
  sku: string;
  imageUrl: string;
  photographer: string | null;
  pageUrl: string | null;
}[] = [
  {
    sku: 'BWL-PTK-01',
    imageUrl: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7',
    photographer: 'Kalyani Akella',
    pageUrl: 'https://unsplash.com/photos/vgTntT8PmIM',
  },
  {
    sku: 'BWL-BYO-01',
    imageUrl: 'https://images.unsplash.com/photo-1775039984426-544b16dc2993',
    photographer: 'Zayed Ahmed Zadu',
    pageUrl:
      'https://unsplash.com/photos/spicy-chicken-and-rice-bowl-with-cucumber-and-onion-KnIeqQyEi2E',
  },
  {
    sku: 'BWL-RJC-01',
    imageUrl: 'https://images.unsplash.com/photo-1680359873815-f5300586dd8d',
    photographer: 'PRATEEK JAISWAL',
    pageUrl: 'https://unsplash.com/photos/a-white-plate-topped-with-rice-and-beans-93RhzdPTCyU',
  },
  {
    sku: 'PLT-CHL-01',
    imageUrl: 'https://images.unsplash.com/photo-1788602564560-9bcbf0f9acb6',
    photographer: 'Zoshua Colah',
    pageUrl: 'https://unsplash.com/photos/chana-masala-with-fried-bhatura-bread-Idh9dnG2v8w',
  },
  {
    sku: 'PLT-BCH-01',
    imageUrl: 'https://images.unsplash.com/photo-1742599361539-f096753d1100',
    photographer: 'Imad 786',
    pageUrl: 'https://unsplash.com/photos/gwUA_pHaOYY',
  },
  {
    sku: 'PLT-DLM-01',
    imageUrl: 'https://images.unsplash.com/photo-1789983665266-f1a6ea13b311',
    photographer: 'Chetanya Sharma',
    pageUrl: 'https://unsplash.com/photos/dal-makhani-in-black-pot-WR13Tw8gmsA',
  },
  {
    sku: 'PLT-PLK-01',
    imageUrl: 'https://images.unsplash.com/photo-1767114915936-745dd372f1d8',
    photographer: 'Chetanya Sharma',
    pageUrl:
      'https://unsplash.com/photos/a-delicious-indian-meal-with-spinach-and-flatbread-_bAW_ln_-Zs',
  },
  {
    sku: 'THL-JAN-01',
    imageUrl: 'https://images.unsplash.com/photo-1589778655375-3e622a9fc91c',
    photographer: 'Barun Ghosh',
    pageUrl: 'https://unsplash.com/photos/assorted-foods-on-stainless-steel-tray-wClFKcjhNcI',
  },
  {
    sku: 'BIR-VEG-01',
    imageUrl: 'https://images.unsplash.com/photo-1736680056325-ba2ade6250a3',
    photographer: 'Nosh Caterers',
    pageUrl: 'https://unsplash.com/photos/L07CScWpHhk',
  },
  {
    sku: 'BIR-CHK-01',
    imageUrl: 'https://images.unsplash.com/photo-1716550781939-beb7d7247aae',
    photographer: 'Sarabjeet Singh',
    pageUrl: 'https://unsplash.com/photos/q29oNjt3sEQ',
  },
  {
    sku: 'WRP-PNR-01',
    imageUrl: 'https://images.unsplash.com/photo-1562059390-a761a084768e',
    photographer: 'Ryan Concepcion',
    pageUrl: 'https://unsplash.com/photos/wrapped-food-with-gravies-50KffXbjIOg',
  },
  {
    sku: 'WRP-CHK-01',
    imageUrl: 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f',
    photographer: 'Max Griss',
    pageUrl: 'https://unsplash.com/photos/white-and-brown-food-on-white-ceramic-plate-Spp1G283dow',
  },
  {
    sku: 'SAL-QCP-01',
    imageUrl: 'https://images.unsplash.com/photo-1623428187969-5da2dcea5ebf',
    photographer: 'Sonny Mauricio',
    pageUrl:
      'https://unsplash.com/photos/a-blue-bowl-filled-with-vegetables-and-a-wooden-spoon-yhc4pSbl01A',
  },
  {
    sku: 'SAL-SPR-01',
    imageUrl: 'https://images.unsplash.com/photo-1622732777601-e744c3401d44',
    photographer: 'Sumeet B',
    pageUrl: null,
  },
  {
    sku: 'BRK-DSA-01',
    imageUrl: 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976',
    photographer: 'Deepal Tamang',
    pageUrl: 'https://unsplash.com/photos/dosa-with-masala-and-chutney-breakfast-5oF7d_hPJG4',
  },
  {
    sku: 'BRK-PHA-01',
    imageUrl: 'https://images.unsplash.com/photo-1789991184412-c29c9dfa2b39',
    photographer: 'Zoshua Colah',
    pageUrl: 'https://unsplash.com/photos/poha-breakfast-with-peanuts-and-lime-_yxndM0wO8c',
  },
  {
    sku: 'BRK-APR-01',
    imageUrl: 'https://images.unsplash.com/photo-1708783741187-ff1d081d87da',
    photographer: 'Rimsha Noor',
    pageUrl: 'https://unsplash.com/photos/a-plate-of-flat-bread-on-a-wooden-table-uOcFC1NH5h0',
  },
  {
    sku: 'SNK-SMS-01',
    imageUrl: 'https://images.unsplash.com/photo-1601050690597-df0568f70950',
    photographer: 'kabir cheema',
    pageUrl: 'https://unsplash.com/photos/samosas-with-green-chili-and-pomegranate-8T9AVksyt7s',
  },
  {
    sku: 'DES-GLB-01',
    imageUrl: 'https://images.unsplash.com/photo-1595608010652-d8bf1103a1c5',
    photographer: 'Muhammad talha',
    pageUrl: 'https://unsplash.com/photos/brown-round-fruits-on-clear-glass-bowl-wJ818PxbMy0',
  },
  {
    sku: 'DES-PHR-01',
    imageUrl: 'https://images.unsplash.com/photo-1642614696258-6eadac9705f0',
    photographer: 'Aneta Voborilova',
    pageUrl: 'https://unsplash.com/photos/a-bowl-of-mango-soup-next-to-a-glass-of-milk-BFQMn0-MEao',
  },
  {
    sku: 'DRK-LSI-01',
    imageUrl: 'https://images.unsplash.com/photo-1558113583-d75f23fcb8a9',
    photographer: 'Ellie Ellien',
    pageUrl: 'https://unsplash.com/photos/white-liquid-in-clear-drinking-glass-D0DY3mA3T7Q',
  },
  {
    sku: 'DRK-LIM-01',
    imageUrl: 'https://images.unsplash.com/photo-1651993737174-6890c1daef5b',
    photographer: 'Rajasekhar R',
    pageUrl: 'https://unsplash.com/photos/a-glass-of-lemonade-with-limes-and-limes-U4mCZiti-aM',
  },
  {
    sku: 'DSH-SAG-01',
    imageUrl: 'https://images.unsplash.com/photo-1716959669858-11d415bdead6',
    photographer: 'You Le',
    pageUrl: null,
  },
];

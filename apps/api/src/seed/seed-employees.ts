import type { PrismaClient } from '../generated/prisma/client.js';
import { EMPLOYEE_SEED, seedEmail } from './employees-data.js';

/** Creates seeded employees when their email doesn't exist yet, and sets an owner if none. */
export async function seedEmployees(prisma: PrismaClient): Promise<number> {
  const [allergens, tags] = await Promise.all([
    prisma.allergen.findMany(),
    prisma.dietaryTag.findMany(),
  ]);
  const idOf = (rows: { id: string; name: string }[], name: string) => {
    const row = rows.find((r) => r.name === name);
    if (!row) throw new Error(`Employee seed refers to unknown "${name}"`);
    return row.id;
  };

  let total = 0;
  for (const [companyName, people] of Object.entries(EMPLOYEE_SEED)) {
    const company = await prisma.company.findUnique({
      where: { name: companyName },
      include: { domains: { orderBy: { domain: 'asc' } } },
    });
    if (!company) continue;
    // Prefer the shortest domain (e.g. northwind.example over northwind-analytics.example).
    const domain = [...company.domains].sort((a, b) => a.domain.length - b.domain.length)[0]!
      .domain;
    let ownerId: string | null = null;
    for (const [index, person] of people.entries()) {
      const email = seedEmail(person.name, domain);
      const flags = person.flags ?? '';
      const employee =
        (await prisma.employee.findUnique({ where: { email } })) ??
        (await prisma.employee.create({
          data: {
            companyId: company.id,
            name: person.name,
            email,
            phone: person.phone ?? '',
            canChooseAddress: flags.includes('A'),
            canChangeDeliveryTime: flags.includes('T'),
            canChangePackaging: flags.includes('P'),
            allergies: {
              create: (person.allergies ?? []).map((n) => ({ allergenId: idOf(allergens, n) })),
            },
            dietaryPreferences: {
              create: (person.diet ?? []).map((n) => ({ dietaryTagId: idOf(tags, n) })),
            },
          },
        }));
      if (index === 0) ownerId = employee.id;
      total++;
    }
    if (!company.ownerId && ownerId) {
      await prisma.company.update({ where: { id: company.id }, data: { ownerId } });
    }
  }
  return total;
}

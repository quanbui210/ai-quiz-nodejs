import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateResourcePricing() {
  console.log('Starting migration of resource pricing data...\n');

  const resources = await prisma.careerResource.findMany({
    where: {
      description: { contains: '[' }
    }
  });

  console.log(`Found ${resources.length} resources with potential price info\n`);

  let updatedCount = 0;
  let skippedCount = 0;

  for (const resource of resources) {
    const priceMatch = resource.description?.match(/\[([^\]]+)\]/);
    if (priceMatch && priceMatch[1]) {
      const priceInfo = priceMatch[1];
      const parts = priceInfo.split(' | ');
      
      let isPaid: boolean | null = null;
      let price: string | null = null;

      for (const part of parts) {
        if (part === 'Paid') {
          isPaid = true;
        } else if (part === 'Free') {
          isPaid = false;
        } else if (part.startsWith('Price: ')) {
          price = part.replace('Price: ', '');
        }
      }

      const cleanDescription = resource.description
        ?.replace(/\n\n\[[^\]]+\]$/, '')
        .replace(/\[[^\]]+\]$/, '')
        .trim();

      await prisma.careerResource.update({
    where: { id: resource.id },
        data: {
          isPaid,
          price,
          description: cleanDescription || resource.description,
        } as any, // Type assertion needed until Prisma types are regenerated
      });

      updatedCount++;
      console.log(`✓ Updated resource "${resource.title}": isPaid=${isPaid}, price=${price || 'N/A'}`);
    } else {
      skippedCount++;
    }
  }

  console.log(`\nMigration completed:`);
  console.log(`  - Updated: ${updatedCount} resources`);
  console.log(`  - Skipped: ${skippedCount} resources (no price info found)`);
}

migrateResourcePricing()
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


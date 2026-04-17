import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const links = await prisma.utmLink.findMany();
  console.log(`Found ${links.length} UTM links. Updating...`);

  for (const link of links) {
    if (!link.fullUrl.includes('lid=')) {
      const separator = link.fullUrl.includes('?') ? '&' : '?';
      const updatedUrl = `${link.fullUrl}${separator}lid=${link.id}`;
      
      await prisma.utmLink.update({
        where: { id: link.id },
        data: { fullUrl: updatedUrl }
      });
      console.log(`✅ Updated link "${link.name}": ${updatedUrl}`);
    } else {
      console.log(`ℹ️ Link "${link.name}" already has lid.`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
    const username = 'prepodavai_esvasileva';
    const password = 'stA-ud3-sKv-4gT';

    console.log(`Creating admin user: ${username}`);

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const existingUser = await prisma.appUser.findFirst({
        where: { username },
    });

    let user;
    if (existingUser) {
        user = await prisma.appUser.update({
            where: { id: existingUser.id },
            data: { passwordHash },
        });
    } else {
        user = await prisma.appUser.create({
            data: {
                username,
                passwordHash,
                firstName: 'Admin',
                lastName: 'User',
                source: 'web',
                phoneVerified: true,
            },
        });
    }

    console.log(`Admin user created/updated!`);
    console.log(`ID: ${user.id}`);
    console.log(`Username: ${user.username}`);
    console.log(`\nIMPORTANT: Add this ID to ADMIN_USER_IDS in your .env file:`);
    console.log(`ADMIN_USER_IDS=${user.id}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

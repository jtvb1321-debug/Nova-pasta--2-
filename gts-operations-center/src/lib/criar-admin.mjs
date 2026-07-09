import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const hash = await bcrypt.hash('gts2024', 10);

await prisma.usuario.create({
  data: {
    nome: 'Administrador',
    email: 'admin@gtsnet.com.br',
    senha: hash,
    role: 'ADMIN',
    ativo: true
  }
});

console.log('✅ Usuário admin criado com sucesso!');
await prisma.$disconnect();
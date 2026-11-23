import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log(" Démarrage du seed...");

  const annee = await prisma.anneeAcademique.upsert({
    where: { libelle: "2026-2027" },
    update: {},
    create: { libelle: "2026-2027", isActive: true, isClosed: false },
  });

  const classe = await prisma.classe.upsert({
    where: { code_anneeAcademiqueId: { code: "L1-INFO", anneeAcademiqueId: annee.id } },
    update: {},
    create: { nom: "L1 Génie Informatique", code: "L1-INFO", anneeAcademiqueId: annee.id },
  });

  for (const nom of ["Auditoire A", "Labo Info 1"]) {
    await prisma.salle.upsert({ where: { nom }, update: {}, create: { nom, capacite: 50 } });
  }

  const profHash = await bcrypt.hash("Prof@2026!", 12);
  await prisma.adminUser.upsert({
    where: { email: "prof@cabinet.test" },
    update: {},
    create: { email: "prof@cabinet.test", nom: "Dupont", prenom: "Jean", passwordHash: profHash, role: "PROF", isActive: true },
  });

  const staffHash = await bcrypt.hash("Staff@2026!", 12);
  await prisma.adminUser.upsert({
    where: { email: "staff@cabinet.test" },
    update: {},
    create: { email: "staff@cabinet.test", nom: "Martin", prenom: "Sophie", passwordHash: staffHash, role: "STAFF", isActive: true },
  });

  console.log(" Seed terminé avec succès !");
}

main()
  .catch((e) => { console.error("❌ Erreur :", e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
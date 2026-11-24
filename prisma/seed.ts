import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Démarrage du seed...");

  // 1. Année académique
  const annee = await prisma.anneeAcademique.upsert({
    where: { libelle: "2026-2027" },
    update: {},
    create: { libelle: "2026-2027", isActive: true, isClosed: false },
  });

  // 2. Classe L1 (pour les tests de base)
  const classeL1 = await prisma.classe.upsert({
    where: { code_anneeAcademiqueId: { code: "L1-INFO", anneeAcademiqueId: annee.id } },
    update: {},
    create: { nom: "L1 Génie Informatique", code: "L1-INFO", anneeAcademiqueId: annee.id },
  });

  // 3. Classe L3 (pour l'étudiant de test)
  const classeL3 = await prisma.classe.upsert({
    where: { code_anneeAcademiqueId: { code: "L3-INFO-APP", anneeAcademiqueId: annee.id } },
    update: {},
    create: { nom: "L3 Informatique Appliquée", code: "L3-INFO-APP", anneeAcademiqueId: annee.id },
  });

  // 4. Salles
  for (const nom of ["Auditoire A", "Labo Info 1"]) {
    await prisma.salle.upsert({ where: { nom }, update: {}, create: { nom, capacite: 50 } });
  }

  // 5. Comptes Admin (Prof & Staff)
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

  // 6. ÉTUDIANT DE TEST (Lemar Cimanga Mbuyamba)
  // On vérifie s'il existe déjà pour éviter les doublons
  const existingEtudiant = await prisma.etudiant.findUnique({
    where: { email: "lemar@cabinet.test" }
  });

  if (!existingEtudiant) {
    const etudiantHash = await bcrypt.hash("Etudiant@2026!", 12);

    const etudiant = await prisma.etudiant.create({
      data: {
        nom: "Mbuyamba",
        postNom: "Cimanga",
        prenom: "Lemar",
        email: "lemar@cabinet.test",
        telephone: "+243000000000",
        matricule: "24/12345678", // Format valide
        rgpdConsent: true,
      }
    });

    await prisma.inscription.create({
      data: {
        etudiantId: etudiant.id,
        anneeAcademiqueId: annee.id,
        classeId: classeL3.id,
        statut: "VALIDEE", // Déjà approuvé !
        passwordHash: etudiantHash,
        mustChangePassword: false, // Pas besoin de changer le mot de passe pour le test
      }
    });
    
    console.log("Étudiant de test créé avec succès : lemar@cabinet.test");
  } else {
    console.log("L'étudiant de test existe déjà.");
  }

  console.log("Seed terminé avec succès !");
  console.log("-----------------------------------------");
  console.log("COMPTES DE TEST :");
  console.log("PROF    : prof@cabinet.test / Prof@2026!");
  console.log("STAFF   : staff@cabinet.test / Staff@2026!");
  console.log("ETUDIANT: lemar@cabinet.test / Etudiant@2026! (L3)");
  console.log("-----------------------------------------");
}

main()
  .catch((e) => { 
    console.error("Erreur :", e); 
    process.exit(1); 
  })
  .finally(async () => { 
    await prisma.$disconnect(); 
  });
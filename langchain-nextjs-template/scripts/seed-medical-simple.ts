/**
 * Simple Medical Data Seeding Script
 */

import { PrismaClient } from '@prisma/client';
import { getMedicalDataService, MedicalDocument, MedicalCategory, MedicalSpecialty } from '../lib/medical/medical-data-service';
import { getQdrantService } from '../lib/vector/qdrant-service';

const prisma = new PrismaClient();

const MEDICAL_DATA: MedicalDocument[] = [
    {
        id: 'diabetes-001',
        title: 'Type 2 Diabetes',
        content: 'Type 2 diabetes is a chronic condition affecting blood sugar regulation. Symptoms include increased thirst, frequent urination, fatigue. Risk factors include obesity, sedentary lifestyle, family history. Treatment involves lifestyle changes and medications like metformin.',
        category: MedicalCategory.DISEASES,
        source: 'Medical Guidelines',
        specialty: MedicalSpecialty.ENDOCRINOLOGY,
        trustScore: 0.9
    },
    {
        id: 'hypertension-001',
        title: 'High Blood Pressure',
        content: 'Hypertension is elevated blood pressure above 130/80 mmHg. Often has no symptoms. Risk factors include age, obesity, stress. Treatment includes lifestyle modifications and medications like ACE inhibitors. Complications include heart disease and stroke.',
        category: MedicalCategory.DISEASES,
        source: 'Cardiology Guidelines',
        specialty: MedicalSpecialty.CARDIOLOGY,
        trustScore: 0.95
    },
    {
        id: 'chest-pain-001',
        title: 'Chest Pain Assessment',
        content: 'Chest pain can indicate various conditions from minor to life-threatening. Cardiac chest pain may feel like pressure, crushing, or squeezing. Always seek immediate medical attention for severe chest pain with shortness of breath or sweating.',
        category: MedicalCategory.SYMPTOMS,
        source: 'Emergency Medicine',
        specialty: MedicalSpecialty.CARDIOLOGY,
        trustScore: 0.92
    }
];

async function main() {
    console.log('🏥 Starting medical data seeding...');

    try {
        // Initialize vector database
        const qdrant = getQdrantService();
        await qdrant.initializeCollections();

        // Initialize medical service
        const medicalService = getMedicalDataService(prisma);

        // Seed medical knowledge
        const result = await medicalService.ingestGlobalMedicalKnowledge(MEDICAL_DATA);

        console.log(`✅ Seeded ${result.ingested} medical documents`);

        // Test query
        const testResult = await medicalService.queryMedicalKnowledge({
            query: "diabetes symptoms",
            userId: 'test-user',
            sessionId: 'test-session'
        });

        console.log(`🔍 Test found ${testResult.globalMatches.length} matches`);
        console.log('🎉 Seeding completed successfully!');

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    main().catch(console.error);
}

export default main;

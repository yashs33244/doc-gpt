/**
 * Medical Data Seeding Script for Doctor GPT
 * Seeds the database with medical knowledge and sample doctor problem-solution datasets
 */

import { PrismaClient } from '@prisma/client';
import { config } from '../config';

const prisma = new PrismaClient();

// Sample medical knowledge data with citations
const MEDICAL_KNOWLEDGE_DATA = [
    {
        title: "Type 2 Diabetes Management Guidelines",
        content: "Type 2 diabetes is a chronic condition where the body becomes resistant to insulin or doesn't produce enough insulin to maintain normal glucose levels. Management involves lifestyle modifications including diet, exercise, and medication when necessary. The American Diabetes Association recommends maintaining HbA1c levels below 7% for most adults. First-line treatment typically includes metformin, with additional medications added as needed. Regular monitoring of blood glucose, blood pressure, and lipid levels is essential.",
        summary: "Comprehensive guidelines for managing Type 2 diabetes including medication, lifestyle modifications, and monitoring recommendations.",
        source: "American Diabetes Association",
        sourceUrl: "https://diabetesjournals.org/care/issue/46/Supplement_1",
        category: "endocrinology",
        tags: ["diabetes", "glucose", "insulin", "metformin", "HbA1c"],
        specialty: "Endocrinology",
        trustScore: 0.95
    },
    {
        title: "Hypertension Treatment and Management",
        content: "Hypertension, defined as blood pressure ≥130/80 mmHg, is a major risk factor for cardiovascular disease. Treatment involves lifestyle modifications and antihypertensive medications. The ACC/AHA guidelines recommend ACE inhibitors, ARBs, thiazide diuretics, or calcium channel blockers as first-line therapy. Target blood pressure for most adults is <130/80 mmHg. Regular monitoring and medication adherence are crucial for optimal outcomes.",
        summary: "Current guidelines for hypertension diagnosis, treatment targets, and medication selection.",
        source: "American College of Cardiology",
        sourceUrl: "https://www.acc.org/guidelines/",
        category: "cardiology",
        tags: ["hypertension", "blood pressure", "ACE inhibitors", "cardiovascular"],
        specialty: "Cardiology",
        trustScore: 0.94
    },
    {
        title: "Pneumonia Diagnosis and Treatment",
        content: "Community-acquired pneumonia (CAP) is a common respiratory infection requiring prompt diagnosis and treatment. Clinical presentation includes fever, cough, dyspnea, and chest pain. Chest X-ray and laboratory studies aid in diagnosis. Treatment varies based on severity and risk factors. Outpatient treatment typically includes amoxicillin or macrolides. Hospitalized patients may require combination therapy with beta-lactam plus macrolide or fluoroquinolone monotherapy.",
        summary: "Evidence-based approach to pneumonia diagnosis, severity assessment, and treatment recommendations.",
        source: "Infectious Diseases Society of America",
        sourceUrl: "https://www.idsociety.org/practice-guideline/cap-in-adults/",
        category: "infectious_disease",
        tags: ["pneumonia", "respiratory", "antibiotics", "chest X-ray"],
        specialty: "Pulmonology",
        trustScore: 0.93
    },
    {
        title: "Depression Screening and Management",
        content: "Major depressive disorder affects millions worldwide and requires systematic screening and evidence-based treatment. The PHQ-9 is a validated screening tool for depression in primary care. Treatment includes psychotherapy, pharmacotherapy, or combination therapy. First-line antidepressants include SSRIs and SNRIs. Cognitive behavioral therapy (CBT) is effective for mild to moderate depression. Regular follow-up and monitoring for suicidal ideation are essential.",
        summary: "Comprehensive approach to depression screening, diagnosis, and treatment in primary care settings.",
        source: "American Psychiatric Association",
        sourceUrl: "https://www.psychiatry.org/patients-families/depression",
        category: "psychiatry",
        tags: ["depression", "PHQ-9", "SSRI", "CBT", "mental health"],
        specialty: "Psychiatry",
        trustScore: 0.92
    },
    {
        title: "Acute Myocardial Infarction Management",
        content: "Acute myocardial infarction (AMI) is a medical emergency requiring immediate intervention. STEMI patients require primary PCI within 90 minutes when possible. NSTEMI management includes antiplatelet therapy, anticoagulation, and risk stratification. All patients should receive aspirin, clopidogrel, and statins unless contraindicated. Beta-blockers and ACE inhibitors improve long-term outcomes. Cardiac rehabilitation is recommended for all eligible patients.",
        summary: "Emergency management protocols and evidence-based treatment for acute myocardial infarction.",
        source: "American Heart Association",
        sourceUrl: "https://www.ahajournals.org/journal/circ",
        category: "cardiology",
        tags: ["myocardial infarction", "STEMI", "PCI", "antiplatelet", "emergency"],
        specialty: "Cardiology",
        trustScore: 0.96
    }
];

// Sample doctor problem-solution datasets
const DOCTOR_PROBLEM_SOLUTIONS = [
    {
        problem: "A 45-year-old male presents with chest pain, shortness of breath, and diaphoresis that started 2 hours ago. He has a history of hypertension and smoking. What is your immediate approach?",
        solution: "This presentation is concerning for acute coronary syndrome. Immediate steps include: 1) Obtain 12-lead ECG within 10 minutes, 2) Administer aspirin 325mg chewed unless contraindicated, 3) Obtain IV access and draw cardiac biomarkers (troponin), 4) Provide supplemental oxygen if SpO2 <90%, 5) Pain management with sublingual nitroglycerin if BP allows, 6) Prepare for emergent cardiology consultation. If STEMI is confirmed, activate catheterization lab for primary PCI.",
        specialty: "Emergency Medicine",
        difficulty: "high",
        urgency: "emergency",
        keySymptoms: ["chest pain", "shortness of breath", "diaphoresis"],
        differentialDiagnosis: ["STEMI", "NSTEMI", "unstable angina", "aortic dissection"],
        citations: ["AHA/ACC Guidelines for STEMI Management", "ESC Guidelines for Acute Coronary Syndromes"]
    },
    {
        problem: "A 28-year-old female presents with a 3-day history of dysuria, urinary frequency, and suprapubic pain. She is sexually active and has no fever. Urinalysis shows nitrites positive, leukocyte esterase positive. What is your diagnosis and treatment plan?",
        solution: "Diagnosis: Uncomplicated urinary tract infection (cystitis). Treatment plan: 1) First-line antibiotic: Nitrofurantoin 100mg BID x 5 days or trimethoprim-sulfamethoxazole DS BID x 3 days (if local resistance <20%), 2) Increase fluid intake, 3) Phenazopyridine for symptom relief if needed, 4) Patient education about prevention strategies, 5) Follow-up if symptoms persist after 48-72 hours of treatment, 6) Consider urine culture if recurrent infections.",
        specialty: "Family Medicine",
        difficulty: "low",
        urgency: "low",
        keySymptoms: ["dysuria", "urinary frequency", "suprapubic pain"],
        differentialDiagnosis: ["cystitis", "urethritis", "pyelonephritis", "sexually transmitted infection"],
        citations: ["IDSA Guidelines for UTI Treatment", "American Family Physician UTI Management"]
    },
    {
        problem: "A 65-year-old male with diabetes presents with a foot ulcer that has been present for 2 weeks. The ulcer is 2cm in diameter, located on the plantar surface of the right great toe, with surrounding erythema and purulent drainage. What is your assessment and management?",
        solution: "Assessment: Diabetic foot ulcer with signs of infection (Wagner Grade 2-3). Management: 1) Wound culture and sensitivity testing, 2) X-ray of foot to rule out osteomyelitis, 3) Vascular assessment (ABI, pulse examination), 4) Debridement of necrotic tissue, 5) Empirical antibiotic therapy: Clindamycin + fluoroquinolone or amoxicillin-clavulanate, 6) Offloading with total contact casting or offloading shoe, 7) Glucose optimization (target HbA1c <7%), 8) Wound care with appropriate dressing, 9) Podiatry and endocrinology referral, 10) Patient education on foot care.",
        specialty: "Endocrinology",
        difficulty: "medium",
        urgency: "medium",
        keySymptoms: ["foot ulcer", "erythema", "purulent drainage", "diabetes"],
        differentialDiagnosis: ["infected diabetic ulcer", "osteomyelitis", "peripheral arterial disease", "neuropathic ulcer"],
        citations: ["IDSA Diabetic Foot Infection Guidelines", "American Diabetes Association Foot Care Guidelines"]
    },
    {
        problem: "A 35-year-old female presents with a 2-month history of fatigue, weight gain, cold intolerance, and dry skin. Her TSH is 15 mIU/L (normal 0.4-4.0) and free T4 is 0.6 ng/dL (normal 0.8-1.8). What is your diagnosis and treatment approach?",
        solution: "Diagnosis: Primary hypothyroidism. Treatment approach: 1) Start levothyroxine 1.6 mcg/kg/day (typically 50-100 mcg daily), 2) Take on empty stomach, 1 hour before breakfast, 3) Recheck TSH and free T4 in 6-8 weeks, 4) Adjust dose by 12.5-25 mcg increments to achieve TSH 0.4-2.5 mIU/L, 5) Consider TPO antibodies to evaluate for Hashimoto's thyroiditis, 6) Screen for other autoimmune conditions, 7) Patient education about medication compliance and timing, 8) Annual monitoring once stable, 9) Adjust dose during pregnancy if applicable.",
        specialty: "Endocrinology",
        difficulty: "low",
        urgency: "low",
        keySymptoms: ["fatigue", "weight gain", "cold intolerance", "dry skin"],
        differentialDiagnosis: ["primary hypothyroidism", "subclinical hypothyroidism", "secondary hypothyroidism", "thyroiditis"],
        citations: ["American Thyroid Association Guidelines", "Endocrine Society Clinical Practice Guidelines"]
    },
    {
        problem: "An 8-year-old child presents with a 5-day history of fever, sore throat, and difficulty swallowing. Physical exam shows tonsillar exudates, cervical lymphadenopathy, and absence of cough. Rapid strep test is positive. What is your treatment plan?",
        solution: "Diagnosis: Group A Streptococcal pharyngitis. Treatment plan: 1) First-line: Amoxicillin 50 mg/kg/day divided BID x 10 days (max 1000 mg/day), 2) Alternative for penicillin allergy: Azithromycin 12 mg/kg once daily x 5 days, 3) Supportive care: acetaminophen or ibuprofen for pain/fever, throat lozenges, increased fluid intake, 4) Return to school/activities 24 hours after starting antibiotics and fever-free, 5) Complete full antibiotic course to prevent rheumatic fever, 6) Follow-up if symptoms worsen or persist after 48-72 hours of treatment, 7) Family members should be evaluated if symptomatic.",
        specialty: "Pediatrics",
        difficulty: "low",
        urgency: "low",
        keySymptoms: ["fever", "sore throat", "tonsillar exudates", "lymphadenopathy"],
        differentialDiagnosis: ["strep throat", "viral pharyngitis", "mononucleosis", "peritonsillar abscess"],
        citations: ["IDSA Streptococcal Pharyngitis Guidelines", "AAP Clinical Practice Guidelines"]
    }
];

async function seedMedicalKnowledge() {
    console.log('Seeding medical knowledge database...');

    for (const knowledge of MEDICAL_KNOWLEDGE_DATA) {
        try {
            // Generate a mock embedding (in production, this would use actual embedding API)
            const mockEmbedding = Array.from({ length: 1536 }, () => Math.random() - 0.5);

            await prisma.medicalKnowledge.create({
                data: {
                    title: knowledge.title,
                    content: knowledge.content,
                    summary: knowledge.summary,
                    source: knowledge.source,
                    sourceUrl: knowledge.sourceUrl,
                    category: knowledge.category,
                    tags: knowledge.tags,
                    specialty: knowledge.specialty,
                    trustScore: knowledge.trustScore,
                    // embedding: mockEmbedding, // Uncomment when pgvector is properly set up
                    lastUpdated: new Date(),
                }
            });

            console.log(`✅ Added: ${knowledge.title}`);
        } catch (error) {
            console.error(`❌ Failed to add ${knowledge.title}:`, error);
        }
    }
}

async function seedDoctorProblems() {
    console.log('Seeding doctor problem-solution datasets...');

    // Create a demo user for the problems
    const demoUser = await prisma.user.upsert({
        where: { email: 'demo@doctorgpt.com' },
        update: {},
        create: {
            id: 'demo-user-id',
            email: 'demo@doctorgpt.com',
            name: 'Demo Medical User'
        }
    });

    for (const [index, problemSolution] of DOCTOR_PROBLEM_SOLUTIONS.entries()) {
        try {
            // Create a session for this problem
            const session = await prisma.session.create({
                data: {
                    id: `demo-session-${index + 1}`,
                    userId: demoUser.id,
                    title: `Case ${index + 1}: ${problemSolution.specialty}`,
                    metadata: {
                        difficulty: problemSolution.difficulty,
                        urgency: problemSolution.urgency,
                        specialty: problemSolution.specialty,
                        keySymptoms: problemSolution.keySymptoms,
                        differentialDiagnosis: problemSolution.differentialDiagnosis
                    }
                }
            });

            // Create the problem (user message)
            await prisma.chat.create({
                data: {
                    id: `demo-problem-${index + 1}`,
                    sessionId: session.id,
                    userId: demoUser.id,
                    role: 'USER',
                    content: problemSolution.problem,
                    isHealthcareQuery: true,
                    metadata: {
                        type: 'medical_case',
                        specialty: problemSolution.specialty,
                        difficulty: problemSolution.difficulty,
                        urgency: problemSolution.urgency
                    }
                }
            });

            // Create the solution (assistant message)
            await prisma.chat.create({
                data: {
                    id: `demo-solution-${index + 1}`,
                    sessionId: session.id,
                    userId: demoUser.id,
                    role: 'ASSISTANT',
                    content: problemSolution.solution,
                    isHealthcareQuery: true,
                    confidence: 0.9,
                    citations: JSON.stringify(problemSolution.citations.map((citation, i) => ({
                        id: `citation-${index}-${i}`,
                        title: citation,
                        url: `https://example.com/citation-${index}-${i}`,
                        source: citation.split(' ')[0],
                        snippet: `Reference for ${citation}`
                    }))),
                    metadata: {
                        type: 'medical_solution',
                        specialty: problemSolution.specialty,
                        keySymptoms: problemSolution.keySymptoms,
                        differentialDiagnosis: problemSolution.differentialDiagnosis,
                        citations: problemSolution.citations
                    }
                }
            });

            console.log(`✅ Added case ${index + 1}: ${problemSolution.specialty}`);
        } catch (error) {
            console.error(`❌ Failed to add case ${index + 1}:`, error);
        }
    }
}

async function seedSampleMedicalReports() {
    console.log('Seeding sample medical reports...');

    const sampleReports = [
        {
            fileName: "lab_results_glucose.txt",
            fileType: "txt",
            fileSize: 1024,
            extractedText: "Patient: John Doe\nDOB: 01/15/1975\nTest Date: 10/15/2024\n\nGLUCOSE PANEL:\nFasting Glucose: 145 mg/dL (Normal: 70-100)\nHbA1c: 7.2% (Target: <7.0%)\nRandom Glucose: 180 mg/dL\n\nLIPID PANEL:\nTotal Cholesterol: 220 mg/dL\nLDL: 140 mg/dL\nHDL: 35 mg/dL\nTriglycerides: 250 mg/dL\n\nInterpretation: Elevated glucose levels consistent with diabetes mellitus. Dyslipidemia present.",
            summary: "Glucose panel showing elevated fasting glucose and HbA1c consistent with diabetes. Lipid panel shows dyslipidemia.",
            reportType: "LAB_REPORT",
            medicalTags: ["diabetes", "glucose", "HbA1c", "cholesterol", "lipids"]
        },
        {
            fileName: "prescription_metformin.txt",
            fileType: "txt",
            fileSize: 512,
            extractedText: "PRESCRIPTION\n\nPatient: Jane Smith\nDOB: 03/22/1980\nDate: 10/15/2024\n\nRx: Metformin HCl 500mg\nSig: Take 1 tablet by mouth twice daily with meals\nQty: 60 tablets\nRefills: 5\n\nPrescriber: Dr. Johnson, MD\nDEA: BJ1234567\n\nIndication: Type 2 Diabetes Mellitus\nDiagnosis Code: E11.9",
            summary: "Prescription for Metformin 500mg twice daily for Type 2 diabetes management.",
            reportType: "PRESCRIPTION",
            medicalTags: ["metformin", "diabetes", "prescription", "medication"]
        },
        {
            fileName: "chest_xray_report.txt",
            fileType: "txt",
            fileSize: 768,
            extractedText: "CHEST X-RAY REPORT\n\nPatient: Robert Wilson\nDOB: 07/08/1960\nExam Date: 10/15/2024\nStudy: PA and Lateral Chest\n\nFINDINGS:\nThe lungs are clear without focal consolidation, pleural effusion, or pneumothorax.\nCardiac silhouette is normal in size and configuration.\nMediastinal contours are within normal limits.\nBony structures appear intact.\n\nIMPRESSION:\nNormal chest radiograph.\n\nRadiologist: Dr. Smith, MD",
            summary: "Normal chest X-ray with clear lungs and normal cardiac silhouette.",
            reportType: "DIAGNOSTIC_IMAGE",
            medicalTags: ["chest X-ray", "lungs", "normal", "radiology"]
        }
    ];

    const demoUser = await prisma.user.upsert({
        where: { email: 'demo@doctorgpt.com' },
        update: {},
        create: {
            id: 'demo-user-id',
            email: 'demo@doctorgpt.com',
            name: 'Demo Medical User'
        }
    });

    for (const [index, report] of sampleReports.entries()) {
        try {
            await prisma.medicalReport.create({
                data: {
                    id: `demo-report-${index + 1}`,
                    userId: demoUser.id,
                    fileName: report.fileName,
                    fileType: report.fileType,
                    fileSize: report.fileSize,
                    extractedText: report.extractedText,
                    summary: report.summary,
                    reportType: report.reportType as "LAB_REPORT" | "PRESCRIPTION" | "DIAGNOSTIC_IMAGE" | "MEDICAL_HISTORY" | "DISCHARGE_SUMMARY" | "CONSULTATION_NOTE" | "OTHER",
                    processingStatus: 'COMPLETED',
                    medicalTags: report.medicalTags,
                    metadata: {
                        seedData: true,
                        createdAt: new Date().toISOString(),
                        sampleReport: true
                    }
                }
            });

            console.log(`✅ Added sample report: ${report.fileName}`);
        } catch (error) {
            console.error(`❌ Failed to add report ${report.fileName}:`, error);
        }
    }
}

async function main() {
    try {
        console.log('🚀 Starting Doctor GPT database seeding...');
        console.log('===============================================');

        // Validate configuration
        if (!config.databaseUrl) {
            throw new Error('DATABASE_URL is not configured. Please check your environment variables.');
        }

        console.log('📊 Database connection established');

        // Seed medical knowledge
        await seedMedicalKnowledge();
        console.log('');

        // Seed doctor problem-solution datasets
        await seedDoctorProblems();
        console.log('');

        // Seed sample medical reports
        await seedSampleMedicalReports();
        console.log('');

        console.log('===============================================');
        console.log('✅ Database seeding completed successfully!');
        console.log('');
        console.log('📈 Summary:');
        console.log(`   - Medical Knowledge: ${MEDICAL_KNOWLEDGE_DATA.length} entries`);
        console.log(`   - Doctor Cases: ${DOCTOR_PROBLEM_SOLUTIONS.length} problem-solution pairs`);
        console.log(`   - Sample Reports: 3 medical documents`);
        console.log('');
        console.log('🔗 You can now:');
        console.log('   - Test the chat API with medical queries');
        console.log('   - Upload medical documents for analysis');
        console.log('   - View sample data in pgAdmin (http://localhost:5050)');

    } catch (error) {
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

// Run the seeding script
if (require.main === module) {
    main();
}

export default main;

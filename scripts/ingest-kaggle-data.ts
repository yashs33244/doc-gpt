/**
 * Kaggle Medical Data Ingestion Script
 * 
 * Processes medical datasets from Kaggle and ingests them into the vector database
 * Supports CSV files with medical information
 */

import { PrismaClient } from '@prisma/client';
import { getMedicalDataService, MedicalDocument, MedicalCategory, MedicalSpecialty } from '../lib/medical/medical-data-service';
import { getQdrantService } from '../lib/vector/qdrant-service';
import * as fs from 'fs';
import * as path from 'path';
import * as csv from 'csv-parser';

const prisma = new PrismaClient();

// Configuration for data ingestion
const DATA_DIR = path.join(process.cwd(), 'data', 'kaggle');
const SUPPORTED_FORMATS = ['.csv', '.json'];

interface KaggleDatasetConfig {
  filePath: string;
  titleField: string;
  contentField: string;
  category: MedicalCategory;
  specialty?: MedicalSpecialty;
  source: string;
  trustScore: number;
}

// Predefined dataset configurations
const DATASET_CONFIGS: Record<string, KaggleDatasetConfig> = {
  'disease_symptoms': {
    filePath: 'diseases/disease_symptoms.csv',
    titleField: 'Disease',
    contentField: 'Symptoms',
    category: MedicalCategory.DISEASES,
    specialty: MedicalSpecialty.GENERAL,
    source: 'Kaggle Disease Symptoms Dataset',
    trustScore: 0.85
  },
  'medical_qa': {
    filePath: 'medical_qa/medical_questions.csv',
    titleField: 'Question',
    contentField: 'Answer',
    category: MedicalCategory.GENERAL,
    specialty: MedicalSpecialty.GENERAL,
    source: 'Kaggle Medical Q&A Dataset',
    trustScore: 0.80
  },
  'drug_reviews': {
    filePath: 'medications/drug_reviews.csv',
    titleField: 'Drug',
    contentField: 'Review',
    category: MedicalCategory.MEDICATIONS,
    specialty: MedicalSpecialty.GENERAL,
    source: 'Kaggle Drug Reviews Dataset',
    trustScore: 0.75
  }
};

async function processCsvFile(filePath: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const results: any[] = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

async function processJsonFile(filePath: string): Promise<any[]> {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(fileContent);
}

async function ingestDataset(config: KaggleDatasetConfig): Promise<{ ingested: number; errors: string[] }> {
  const fullPath = path.join(DATA_DIR, config.filePath);
  const errors: string[] = [];
  let ingested = 0;

  try {
    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      console.log(`⚠️  File not found: ${fullPath}`);
      return { ingested: 0, errors: [`File not found: ${fullPath}`] };
    }

    console.log(`📁 Processing: ${config.filePath}`);

    // Process file based on extension
    const fileExt = path.extname(fullPath).toLowerCase();
    let data: any[] = [];

    if (fileExt === '.csv') {
      data = await processCsvFile(fullPath);
    } else if (fileExt === '.json') {
      data = await processJsonFile(fullPath);
    } else {
      throw new Error(`Unsupported file format: ${fileExt}`);
    }

    console.log(`📊 Found ${data.length} records`);

    // Convert to medical documents
    const medicalDocs: MedicalDocument[] = data.map((row, index) => {
      const title = row[config.titleField] || `Document ${index + 1}`;
      const content = row[config.contentField] || '';
      
      // Create comprehensive content
      const fullContent = `${title}\n\n${content}\n\nAdditional Information: ${JSON.stringify(row, null, 2)}`;

      return {
        id: `${config.category}-${index + 1}-${Date.now()}`,
        title: title.substring(0, 200), // Limit title length
        content: fullContent.substring(0, 4000), // Limit content length
        category: config.category,
        source: config.source,
        specialty: config.specialty,
        trustScore: config.trustScore,
        metadata: {
          originalRow: row,
          dataset: config.filePath,
          ingestedAt: new Date().toISOString()
        }
      };
    });

    // Ingest into vector database
    const medicalService = getMedicalDataService(prisma);
    const result = await medicalService.ingestGlobalMedicalKnowledge(medicalDocs);

    console.log(`✅ Ingested ${result.ingested} documents from ${config.filePath}`);
    
    return {
      ingested: result.ingested,
      errors: [...errors, ...result.errors]
    };

  } catch (error) {
    const errorMsg = `Failed to process ${config.filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`;
    console.error(`❌ ${errorMsg}`);
    return { ingested, errors: [...errors, errorMsg] };
  }
}

async function createSampleData(): Promise<void> {
  console.log('📝 Creating sample medical data...');

  const sampleData: MedicalDocument[] = [
    {
      id: 'sample-diabetes-001',
      title: 'Type 2 Diabetes Management',
      content: `Type 2 diabetes is a chronic condition that affects how your body processes blood sugar (glucose). 

Key Symptoms:
- Increased thirst and frequent urination
- Increased hunger
- Fatigue
- Blurred vision
- Slow-healing sores
- Frequent infections

Management Strategies:
- Healthy eating with carbohydrate counting
- Regular physical activity
- Blood sugar monitoring
- Medication adherence
- Regular medical checkups

Complications to Watch:
- Heart disease and stroke
- Nerve damage (neuropathy)
- Kidney damage (nephropathy)
- Eye damage (retinopathy)
- Foot problems

Prevention:
- Maintain healthy weight
- Eat balanced diet
- Exercise regularly
- Don't smoke
- Limit alcohol consumption`,
      category: MedicalCategory.DISEASES,
      source: 'Medical Guidelines',
      specialty: MedicalSpecialty.ENDOCRINOLOGY,
      trustScore: 0.95
    },
    {
      id: 'sample-hypertension-001',
      title: 'Hypertension (High Blood Pressure)',
      content: `Hypertension is a common condition where the force of blood against artery walls is too high.

Blood Pressure Categories:
- Normal: Less than 120/80 mmHg
- Elevated: 120-129/<80 mmHg
- Stage 1: 130-139/80-89 mmHg
- Stage 2: 140/90 mmHg or higher
- Hypertensive Crisis: >180/120 mmHg

Risk Factors:
- Age (risk increases with age)
- Family history
- Being overweight or obese
- Physical inactivity
- Tobacco use
- Too much sodium in diet
- Too little potassium in diet
- Drinking too much alcohol
- Stress
- Certain chronic conditions

Treatment Options:
- Lifestyle changes (diet, exercise, weight management)
- Medications (ACE inhibitors, ARBs, diuretics, calcium channel blockers)
- Regular monitoring
- Stress management

Complications:
- Heart attack or stroke
- Aneurysm
- Heart failure
- Weakened and narrowed blood vessels in kidneys
- Thickened, narrowed, or torn blood vessels in eyes
- Metabolic syndrome
- Trouble with memory or understanding`,
      category: MedicalCategory.DISEASES,
      source: 'American Heart Association',
      specialty: MedicalSpecialty.CARDIOLOGY,
      trustScore: 0.94
    },
    {
      id: 'sample-chest-pain-001',
      title: 'Chest Pain Assessment and Management',
      content: `Chest pain can have many causes, ranging from minor to life-threatening.

Types of Chest Pain:
1. Cardiac chest pain (angina):
   - Pressure, squeezing, or crushing sensation
   - May radiate to arms, neck, jaw, or back
   - Often triggered by physical exertion or stress

2. Non-cardiac chest pain:
   - Sharp, stabbing pain
   - Burning sensation
   - Pain that worsens with breathing or movement

Red Flag Symptoms (Seek Immediate Medical Attention):
- Severe chest pain
- Pain radiating to arm, neck, jaw, or back
- Shortness of breath
- Sweating and nausea
- Dizziness or fainting
- Rapid or irregular heartbeat

Common Causes:
- Heart attack (myocardial infarction)
- Angina
- Pulmonary embolism
- Pneumonia
- Gastroesophageal reflux disease (GERD)
- Muscle strain
- Anxiety or panic attacks
- Costochondritis

When to Call 911:
- Chest pain that lasts more than a few minutes
- Pain that doesn't improve with rest
- Pain accompanied by other concerning symptoms
- History of heart disease with new or worsening chest pain

Diagnostic Tests:
- Electrocardiogram (ECG/EKG)
- Blood tests (troponins, CK-MB)
- Chest X-ray
- CT scan or MRI
- Stress test
- Cardiac catheterization`,
      category: MedicalCategory.SYMPTOMS,
      source: 'Emergency Medicine Guidelines',
      specialty: MedicalSpecialty.CARDIOLOGY,
      trustScore: 0.92
    }
  ];

  const medicalService = getMedicalDataService(prisma);
  const result = await medicalService.ingestGlobalMedicalKnowledge(sampleData);
  
  console.log(`✅ Created ${result.ingested} sample documents`);
  if (result.errors.length > 0) {
    console.log('⚠️  Errors:', result.errors);
  }
}

async function main() {
  console.log('🏥 Starting Kaggle medical data ingestion...');

  try {
    // Initialize vector database
    const qdrant = getQdrantService();
    console.log('📊 Initializing vector database...');
    await qdrant.initializeCollections();

    // Create sample data first
    await createSampleData();

    // Check if data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      console.log(`📁 Creating data directory: ${DATA_DIR}`);
      fs.mkdirSync(DATA_DIR, { recursive: true });
      
      console.log(`
📋 To use this script with real Kaggle data:

1. Download medical datasets from Kaggle:
   - Disease-Symptom-Description Dataset
   - Medical Q&A Dataset  
   - Drug Reviews Dataset

2. Place them in the following structure:
   ${DATA_DIR}/
   ├── diseases/
   │   └── disease_symptoms.csv
   ├── medical_qa/
   │   └── medical_questions.csv
   └── medications/
       └── drug_reviews.csv

3. Run this script again to ingest the data
      `);
      
      return;
    }

    // Process each configured dataset
    let totalIngested = 0;
    let totalErrors: string[] = [];

    for (const [datasetName, config] of Object.entries(DATASET_CONFIGS)) {
      console.log(`\n🔄 Processing dataset: ${datasetName}`);
      const result = await ingestDataset(config);
      totalIngested += result.ingested;
      totalErrors.push(...result.errors);
    }

    // Get final statistics
    const medicalService = getMedicalDataService(prisma);
    const stats = await medicalService.getGlobalKnowledgeStats();

    console.log('\n📊 Ingestion Summary:');
    console.log(`✅ Total documents ingested: ${totalIngested}`);
    console.log(`📈 Total in database: ${stats.totalDocuments}`);
    console.log(`🏥 Categories: ${Object.keys(stats.categoryCounts).join(', ')}`);
    console.log(`👨‍⚕️ Specialties: ${Object.keys(stats.specialtyCounts).join(', ')}`);
    console.log(`⭐ Average trust score: ${stats.averageTrustScore.toFixed(2)}`);

    if (totalErrors.length > 0) {
      console.log('\n⚠️  Errors encountered:');
      totalErrors.forEach(error => console.log(`   - ${error}`));
    }

    console.log('\n🎉 Medical data ingestion completed successfully!');

  } catch (error) {
    console.error('❌ Ingestion failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export default main;

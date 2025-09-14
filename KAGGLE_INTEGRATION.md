# 🏥 Kaggle Medical Data Integration Guide

This guide explains how to integrate medical datasets from Kaggle into your Doctor GPT application.

## 📊 **Recommended Kaggle Datasets**

### 1. **Disease-Symptom-Description Dataset**
- **URL**: https://www.kaggle.com/datasets/neelima98/disease-symptom-description-dataset
- **Content**: Disease names, symptoms, and descriptions
- **Use Case**: Global medical knowledge base
- **Format**: CSV

### 2. **Medical Q&A Dataset**
- **URL**: https://www.kaggle.com/datasets/medical-qa/medical-qa
- **Content**: Medical questions and answers
- **Use Case**: Training data for medical responses
- **Format**: CSV

### 3. **Drug Reviews Dataset**
- **URL**: https://www.kaggle.com/datasets/jessicali9530/kuc-hackathon-winter-2018
- **Content**: Drug reviews and ratings
- **Use Case**: Medication information
- **Format**: CSV

### 4. **Medical Image Dataset**
- **URL**: https://www.kaggle.com/datasets/paultimothymooney/chest-xray-pneumonia
- **Content**: Chest X-ray images for pneumonia detection
- **Use Case**: Medical image analysis
- **Format**: Images (JPG/PNG)

## 🚀 **Integration Steps**

### Step 1: Download Datasets
```bash
# Install Kaggle CLI
pip install kaggle

# Set up Kaggle API credentials
mkdir -p ~/.kaggle
echo '{"username":"your_username","key":"your_api_key"}' > ~/.kaggle/kaggle.json
chmod 600 ~/.kaggle/kaggle.json

# Download datasets
kaggle datasets download -d neelima98/disease-symptom-description-dataset
kaggle datasets download -d medical-qa/medical-qa
kaggle datasets download -d jessicali9530/kuc-hackathon-winter-2018
```

### Step 2: Extract and Organize Data
```bash
# Create data directory structure
mkdir -p data/kaggle/{diseases,medical_qa,medications,images}

# Extract datasets
unzip disease-symptom-description-dataset.zip -d data/kaggle/diseases/
unzip medical-qa.zip -d data/kaggle/medical_qa/
unzip kuc-hackathon-winter-2018.zip -d data/kaggle/medications/
```

### Step 3: Run Ingestion Script
```bash
# Install required dependencies
npm install csv-parser

# Run the ingestion script
npx tsx scripts/ingest-kaggle-data.ts
```

## 📁 **Expected Directory Structure**

```
data/
└── kaggle/
    ├── diseases/
    │   └── disease_symptoms.csv
    ├── medical_qa/
    │   └── medical_questions.csv
    ├── medications/
    │   └── drug_reviews.csv
    └── images/
        └── chest_xray/
            ├── train/
            └── test/
```

## 🔧 **Custom Dataset Configuration**

To add your own datasets, modify `scripts/ingest-kaggle-data.ts`:

```typescript
const DATASET_CONFIGS: Record<string, KaggleDatasetConfig> = {
  'your_dataset': {
    filePath: 'your_folder/your_file.csv',
    titleField: 'title_column',
    contentField: 'content_column',
    category: MedicalCategory.DISEASES,
    specialty: MedicalSpecialty.CARDIOLOGY,
    source: 'Your Dataset Source',
    trustScore: 0.85
  }
};
```

## 📊 **Data Quality Guidelines**

### 1. **Content Standards**
- Medical accuracy and reliability
- Proper citation and source attribution
- Regular updates and maintenance
- Privacy compliance (HIPAA, GDPR)

### 2. **Format Requirements**
- UTF-8 encoding
- Consistent column names
- Proper data types
- No missing critical information

### 3. **Trust Score Guidelines**
- **0.9-1.0**: Peer-reviewed medical literature
- **0.8-0.9**: Medical institutions and organizations
- **0.7-0.8**: Medical professionals and experts
- **0.6-0.7**: General medical websites
- **0.5-0.6**: User-generated content

## 🧪 **Testing Your Integration**

### 1. **Check Vector Database**
```bash
# Access Qdrant Web UI
open http://localhost:6333/dashboard

# Or use the custom admin interface
open http://localhost:3000/admin/qdrant
```

### 2. **Test Search Functionality**
```bash
# Test global knowledge search
curl -X POST http://localhost:3000/api/admin/qdrant/search \
  -H "Content-Type: application/json" \
  -d '{"query": "diabetes symptoms", "collection": "knowledge"}'
```

### 3. **Verify Data Quality**
```bash
# Check database statistics
npx tsx -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
prisma.medicalKnowledge.count().then(count => console.log('Total documents:', count));
"
```

## 🔄 **Automated Data Updates**

### 1. **Scheduled Ingestion**
```bash
# Add to crontab for daily updates
0 2 * * * cd /path/to/project && npx tsx scripts/ingest-kaggle-data.ts
```

### 2. **Webhook Integration**
```typescript
// Add webhook endpoint for real-time updates
export async function POST(req: NextRequest) {
  const { dataset, action } = await req.json();
  
  if (action === 'update') {
    await ingestDataset(DATASET_CONFIGS[dataset]);
  }
  
  return NextResponse.json({ success: true });
}
```

## 📈 **Performance Optimization**

### 1. **Batch Processing**
- Process datasets in chunks of 1000 records
- Use database transactions for consistency
- Implement retry logic for failed records

### 2. **Memory Management**
- Stream large files instead of loading into memory
- Use pagination for large datasets
- Implement garbage collection for long-running processes

### 3. **Error Handling**
- Log all ingestion errors
- Implement exponential backoff for retries
- Provide detailed error reporting

## 🛡️ **Security Considerations**

### 1. **Data Privacy**
- Remove or anonymize personal information
- Implement data retention policies
- Regular security audits

### 2. **Access Control**
- Restrict dataset access to authorized users
- Implement audit logging
- Use encrypted connections

### 3. **Compliance**
- Follow HIPAA guidelines for medical data
- Implement data governance policies
- Regular compliance reviews

## 📚 **Additional Resources**

- [Kaggle API Documentation](https://www.kaggle.com/docs/api)
- [Medical Data Privacy Guidelines](https://www.hhs.gov/hipaa/for-professionals/privacy/)
- [Vector Database Best Practices](https://qdrant.tech/documentation/)
- [LangChain Medical AI Patterns](https://js.langchain.com/docs/use_cases/medical)

## 🆘 **Troubleshooting**

### Common Issues:

1. **Memory Issues**: Reduce batch size in ingestion script
2. **Rate Limiting**: Implement delays between API calls
3. **Data Format Errors**: Validate CSV structure before processing
4. **Vector Database Errors**: Check Qdrant service status

### Support:
- Check logs in `logs/ingestion.log`
- Use the admin interface at `/admin/qdrant`
- Monitor database performance with Prisma Studio

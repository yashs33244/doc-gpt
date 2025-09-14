"use client";

import { useState, type FormEvent } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { toast } from "sonner";

interface UploadedDocument {
  id: string;
  fileName: string;
  fileSize: number;
  extractedText: string;
  reportType: string;
  processingStatus: string;
}

interface MedicalDocumentUploadProps {
  sessionId?: string;
  userId?: string;
  onDocumentUploaded?: (doc: UploadedDocument) => void;
}

export function MedicalDocumentUpload({ 
  sessionId = 'session-' + Date.now(), 
  userId = 'user-' + Date.now(),
  onDocumentUploaded 
}: MedicalDocumentUploadProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [reportType, setReportType] = useState("other");
  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedDocument[]>([]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File size too large. Maximum size is 10MB.");
        return;
      }
      
      // Check file type
      const allowedTypes = [
        'application/pdf',
        'text/plain',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg',
        'image/png'
      ];
      
      if (!allowedTypes.includes(file.type)) {
        toast.error("Unsupported file type. Please upload PDF, TXT, DOCX, JPG, or PNG files.");
        return;
      }
      
      setSelectedFile(file);
    }
  };

  const uploadDocument = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!selectedFile) {
      toast.error("Please select a file to upload.");
      return;
    }

    setIsLoading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('reportType', reportType);
      formData.append('userId', userId);
      formData.append('sessionId', sessionId);
      
      const response = await fetch("/api/upload/medical-documents", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          toast.success("Document uploaded and processed successfully!");
          const newDoc = result.document;
          setUploadedDocuments(prev => [...prev, newDoc]);
          onDocumentUploaded?.(newDoc);
          setSelectedFile(null);
          
          // Reset file input
          const fileInput = document.getElementById('medical-file') as HTMLInputElement;
          if (fileInput) fileInput.value = '';
        } else {
          toast.error(result.error || "Upload failed");
        }
      } else {
        const error = await response.json();
        toast.error(error.error || "Upload failed");
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error("Upload failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={uploadDocument} className="space-y-4">
        <div>
          <label htmlFor="medical-file" className="block text-sm font-medium mb-2">
            📄 Select Medical Document
          </label>
          <Input
            id="medical-file"
            type="file"
            accept=".pdf,.txt,.docx,.jpg,.png"
            onChange={handleFileSelect}
            className="cursor-pointer"
          />
          {selectedFile && (
            <p className="text-sm text-gray-600 mt-2">
              Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
            </p>
          )}
        </div>

        <div>
          <label htmlFor="report-type" className="block text-sm font-medium mb-2">
            📋 Document Type
          </label>
          <select
            id="report-type"
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="lab_report">Lab Report</option>
            <option value="prescription">Prescription</option>
            <option value="diagnostic_image">Diagnostic Image Report</option>
            <option value="medical_history">Medical History</option>
            <option value="discharge_summary">Discharge Summary</option>
            <option value="consultation_note">Consultation Note</option>
            <option value="other">Other</option>
          </select>
        </div>

        <Button 
          type="submit" 
          disabled={!selectedFile || isLoading}
          className="w-full"
        >
          {isLoading ? (
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Processing Document...
            </div>
          ) : (
            "🔬 Upload & Analyze Document"
          )}
        </Button>
      </form>

      {uploadedDocuments.length > 0 && (
        <div className="border-t pt-4">
          <h4 className="font-medium text-sm text-gray-700 mb-3">
            📚 Uploaded Documents ({uploadedDocuments.length})
          </h4>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {uploadedDocuments.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between p-2 bg-gray-50 rounded text-xs">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{doc.fileName}</p>
                  <p className="text-gray-500">{doc.reportType} • {(doc.fileSize / 1024).toFixed(1)} KB</p>
                </div>
                <span className={`px-2 py-1 rounded text-xs ${
                  doc.processingStatus === 'COMPLETED' 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {doc.processingStatus}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-xs text-gray-500 space-y-1">
        <p>📝 <strong>Supported formats:</strong> PDF, TXT, DOCX, JPG, PNG (max 10MB)</p>
        <p>🔒 <strong>Privacy:</strong> Documents are processed securely and stored only for this session</p>
        <p>⚕️ <strong>Note:</strong> Uploaded documents will be used to provide personalized medical insights</p>
      </div>
    </div>
  );
}

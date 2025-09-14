"use client";

import { MedicalDocumentUpload } from "./MedicalDocumentUpload";

interface UploadDocumentsFormProps {
  sessionId?: string;
  userId?: string;
  onDocumentUploaded?: (doc: any) => void;
}

export function UploadDocumentsForm(props: UploadDocumentsFormProps) {
  return <MedicalDocumentUpload {...props} />;
}

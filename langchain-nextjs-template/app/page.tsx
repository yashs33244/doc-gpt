import { CustomChatWindow } from "@/components/CustomChatWindow";
import { GuideInfoBox } from "@/components/guide/GuideInfoBox";

export default function Home() {
  const InfoCard = (
    <GuideInfoBox>
      <ul>
        <li className="text-l">
          🩺
          <span className="ml-2">
            <strong>Doctor GPT</strong> - An AI-powered medical assistant that provides 
            evidence-based information using advanced RAG (Retrieval-Augmented Generation) 
            with both global medical knowledge and your uploaded documents.
          </span>
        </li>
        <li className="hidden text-l md:block">
          🔬
          <span className="ml-2">
            Built with{" "}
            <a href="https://js.langchain.com/" target="_blank" className="text-blue-600 hover:underline">
              LangChain.js
            </a>{" "}
            and vector search capabilities for accurate medical information retrieval.
          </span>
        </li>
        <li>
          📋
          <span className="ml-2">
            Upload your medical documents for personalized analysis, or ask questions 
            about symptoms, conditions, and treatments from our curated medical knowledge base.
          </span>
        </li>
        <li className="hidden text-l md:block">
          ⚡
          <span className="ml-2">
            Enhanced with multi-model reasoning using OpenAI and Anthropic Claude 
            for comprehensive medical responses.
          </span>
        </li>
        <li className="text-l">
          💬
          <span className="ml-2">
            Try asking: <code>"What are the symptoms of diabetes?"</code> or 
            <code>"Explain chest pain causes"</code>
          </span>
        </li>
        <li className="text-xs text-gray-600 mt-4">
          ⚠️ <strong>Medical Disclaimer:</strong> This AI assistant provides educational 
          information only and is not a substitute for professional medical advice. 
          Always consult healthcare professionals for medical concerns.
        </li>
      </ul>
    </GuideInfoBox>
  );
  
  return (
    <CustomChatWindow
      endpoint={`${process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://127.0.0.1:8000'}/api/v1/chat/doctor-gpt`}
      emoji="🩺"
      placeholder="Ask me about medical symptoms, conditions, treatments, or upload your medical documents for analysis..."
      emptyStateComponent={InfoCard}
      showIngestForm={true}
      showIntermediateStepsToggle={true}
    />
  );
}

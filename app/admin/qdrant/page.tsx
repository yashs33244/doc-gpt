"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CollectionInfo {
  name: string;
  vectorsCount: number;
  indexedVectorsCount: number;
  pointsCount: number;
  segmentsCount: number;
  status: string;
}

interface SearchResult {
  id: string;
  score: number;
  payload: {
    content: string;
    title: string;
    type: string;
    category?: string;
    source?: string;
    trustScore?: number;
    createdAt: string;
  };
}

export default function QdrantAdminPage() {
  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedCollection, setSelectedCollection] = useState("knowledge");
  const [isLoading, setIsLoading] = useState(false);

  // Fetch collections info
  const fetchCollections = async () => {
    try {
      const response = await fetch('/api/admin/qdrant/collections');
      const data = await response.json();
      setCollections(data);
    } catch (error) {
      console.error('Failed to fetch collections:', error);
    }
  };

  // Search vectors
  const searchVectors = async () => {
    if (!searchQuery.trim()) return;
    
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/qdrant/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          collection: selectedCollection,
          limit: 10
        })
      });
      const data = await response.json();
      setSearchResults(data.results || []);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCollections();
  }, []);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">🔍 Qdrant Vector Database Admin</h1>
        <Button onClick={fetchCollections} variant="outline">
          🔄 Refresh
        </Button>
      </div>

      {/* Collections Overview */}
      <Card>
        <CardHeader>
          <CardTitle>📊 Collections Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {collections.map((collection) => (
              <div key={collection.name} className="border rounded-lg p-4">
                <h3 className="font-semibold text-lg capitalize">
                  {collection.name}
                </h3>
                <div className="space-y-1 text-sm text-gray-600">
                  <p>📈 Vectors: {collection.vectorsCount.toLocaleString()}</p>
                  <p>🔍 Indexed: {collection.indexedVectorsCount.toLocaleString()}</p>
                  <p>📍 Points: {collection.pointsCount.toLocaleString()}</p>
                  <p>📦 Segments: {collection.segmentsCount}</p>
                  <p className={`text-xs px-2 py-1 rounded ${
                    collection.status === 'green' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    Status: {collection.status}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Vector Search */}
      <Card>
        <CardHeader>
          <CardTitle>🔍 Vector Search</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <select
              value={selectedCollection}
              onChange={(e) => setSelectedCollection(e.target.value)}
              className="px-3 py-2 border rounded-md"
            >
              <option value="knowledge">Knowledge Base</option>
              <option value="sessions">Sessions</option>
              <option value="documents">Documents</option>
              <option value="files">Files</option>
            </select>
            <Input
              placeholder="Search medical knowledge..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && searchVectors()}
              className="flex-1"
            />
            <Button 
              onClick={searchVectors} 
              disabled={isLoading || !searchQuery.trim()}
            >
              {isLoading ? "🔍 Searching..." : "🔍 Search"}
            </Button>
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold">Search Results ({searchResults.length})</h3>
              {searchResults.map((result, index) => (
                <div key={result.id} className="border rounded-lg p-4 bg-gray-50">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-medium text-lg">{result.payload.title}</h4>
                    <span className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded">
                      Score: {(result.score * 100).toFixed(1)}%
                    </span>
                  </div>
                  
                  <div className="text-sm text-gray-600 mb-2">
                    <span className="bg-gray-200 px-2 py-1 rounded mr-2">
                      {result.payload.type}
                    </span>
                    {result.payload.category && (
                      <span className="bg-green-100 text-green-800 px-2 py-1 rounded mr-2">
                        {result.payload.category}
                      </span>
                    )}
                    {result.payload.trustScore && (
                      <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded">
                        Trust: {(result.payload.trustScore * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  
                  <p className="text-gray-700 text-sm leading-relaxed">
                    {result.payload.content.substring(0, 300)}
                    {result.payload.content.length > 300 && "..."}
                  </p>
                  
                  <div className="text-xs text-gray-500 mt-2">
                    <p>ID: {result.id}</p>
                    <p>Source: {result.payload.source || 'Unknown'}</p>
                    <p>Created: {new Date(result.payload.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <Card>
        <CardHeader>
          <CardTitle>📈 Quick Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-blue-600">
                {collections.reduce((sum, c) => sum + c.vectorsCount, 0).toLocaleString()}
              </div>
              <div className="text-sm text-gray-600">Total Vectors</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">
                {collections.length}
              </div>
              <div className="text-sm text-gray-600">Collections</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-600">
                {collections.reduce((sum, c) => sum + c.pointsCount, 0).toLocaleString()}
              </div>
              <div className="text-sm text-gray-600">Total Points</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-orange-600">
                {collections.filter(c => c.status === 'green').length}
              </div>
              <div className="text-sm text-gray-600">Healthy Collections</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { agentsApi, type OrchestratorResponse } from '@/lib/api';
import { SearchHeader } from '@/components/search/search-header';
import { SearchForm } from '@/components/search/search-form';
import { SearchResults } from '@/components/search/search-results';
import { authClient } from '@/lib/auth-client';
import { Loader2 } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [result, setResult] = useState<OrchestratorResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log("[Home] Session state:", { session, isPending });
    if (!session?.user && !isPending) {
      console.log("[Home] No session found, redirecting to /login");
      router.push('/login');
    }
  }, [session, isPending, router]);

  const handleSearch = async (query: string) => {
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const data = await agentsApi.orchestrator({ query: query.trim() });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run orchestrator');
    } finally {
      setLoading(false);
    }
  };

  if (isPending) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-[#e8e8e8] font-serif flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-[#6a6a6a]" />
          <p className="text-sm font-light text-[#6a6a6a]">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session?.user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e8e8e8] font-serif">
      <main className="flex items-center justify-center min-h-screen px-4 sm:px-6">
        <div className="w-full max-w-4xl -mt-16">
          <SearchHeader />
          
          <SearchForm onSearch={handleSearch} isLoading={loading} />

          <SearchResults 
            loading={loading} 
            error={error} 
            data={result} 
          />
        </div>
      </main>
    </div>
  );
}

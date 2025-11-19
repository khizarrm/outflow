'use client';

import { AuthQuote } from '@/components/auth/auth-quote';
import { LoginForm } from '@/components/auth/login-form';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

/**
 * Login Page
 * Split-screen authentication page with branding and login form
 */
export default function LoginPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    // If already logged in, redirect to home
    if (session?.user && !isPending) {
      router.push('/');
    }
  }, [session, isPending, router]);

  // Show loading state while checking session
  if (isPending) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0a0a0a]">
        <div className="text-[#6a6a6a] font-light">Loading...</div>
      </div>
    );
  }

  // Don't render login form if already authenticated
  if (session?.user) {
    return null;
  }

  return (
    <div className="container relative h-screen flex-col items-center justify-center grid lg:max-w-none lg:grid-cols-2 lg:px-0 overflow-hidden">
      <AuthQuote />
      <div className="lg:p-8 flex items-center justify-center bg-[#0a0a0a] min-h-screen">
        <div className="w-full px-4">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}


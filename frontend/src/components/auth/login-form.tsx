'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { authClient } from '@/lib/auth-client';
import { Loader2, Mail } from 'lucide-react';

/**
 * Login Form Component
 * Handles Google OAuth and Guest authentication
 */
export function LoginForm() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      await authClient.signIn.social({
        provider: 'google',
        callbackURL: '/',
      });
      // Redirect is handled automatically by better-auth
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in with Google');
      setIsLoading(false);
    }
  };

  const handleGuestSignIn = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log("[Auth] Attempting guest sign in...");
      const res = await authClient.signIn.anonymous();
      console.log("[Auth] Guest sign in response:", res);
      
      console.log("[Auth] Redirecting to /...");
      router.push('/');
      router.refresh();
    } catch (err) {
      console.error("[Auth] Guest sign in error:", err);
      setError(err instanceof Error ? err.message : 'Failed to continue as guest');
      setIsLoading(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      setError('Please enter your email');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // For now, just show that email is not implemented
      setError('Email sign-in coming soon. Please use Google or Guest.');
      setIsLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in');
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[400px] animate-fade-in-up">
      <div className="flex flex-col space-y-2 text-center">
        <h1 className="text-3xl font-light tracking-tight text-[#e8e8e8]">
          Create an account
        </h1>
        <p className="text-sm font-light text-[#6a6a6a]">
          Enter your email below to create your account
        </p>
      </div>

      <div className="grid gap-6">
        {/* Email Form */}
        <form onSubmit={handleEmailSignIn}>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email" className="sr-only">
                Email
              </Label>
              <Input
                id="email"
                placeholder="name@example.com"
                type="email"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect="off"
                disabled={isLoading}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-[#151515] border-[#2a2a2a] text-[#e8e8e8] placeholder:text-[#6a6a6a]"
              />
            </div>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-white text-[#0a0a0a] hover:bg-[#e8e8e8] font-light"
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign in with Email
            </Button>
          </div>
        </form>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <Separator className="w-full bg-[#2a2a2a]" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-[#0a0a0a] px-2 text-[#6a6a6a] font-light">
              Or continue with
            </span>
          </div>
        </div>

        {/* Social Sign In */}
        <div className="grid gap-3">
          <Button
            variant="outline"
            type="button"
            disabled={isLoading}
            onClick={handleGoogleSignIn}
            className="bg-[#151515] border-[#2a2a2a] text-[#e8e8e8] hover:bg-[#1a1a1a] hover:text-white font-light"
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
            )}
            Google
          </Button>

          <Button
            variant="outline"
            type="button"
            disabled={isLoading}
            onClick={handleGuestSignIn}
            className="bg-[#151515] border-[#2a2a2a] text-[#e8e8e8] hover:bg-[#1a1a1a] hover:text-white font-light"
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Mail className="mr-2 h-4 w-4" />
            )}
            Continue as Guest
          </Button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400 text-center font-light animate-fade-in-up">
            {error}
          </div>
        )}
      </div>

      {/* Terms */}
      <p className="px-8 text-center text-xs font-light text-[#6a6a6a]">
        By clicking continue, you agree to our{' '}
        <a
          href="/terms"
          className="underline underline-offset-4 hover:text-[#e8e8e8] transition-colors"
        >
          Terms of Service
        </a>{' '}
        and{' '}
        <a
          href="/privacy"
          className="underline underline-offset-4 hover:text-[#e8e8e8] transition-colors"
        >
          Privacy Policy
        </a>
        .
      </p>
    </div>
  );
}


'use client';

import { Sparkles } from 'lucide-react';

/**
 * Auth Quote Component
 * Displays company branding and motivational quote on login page
 */
export function AuthQuote() {
  return (
    <div className="relative hidden h-full flex-col bg-gradient-to-br from-[#0a0a0a] via-[#0f0f0f] to-[#1a1a1a] p-10 xl:p-12 text-white lg:flex overflow-hidden">
      {/* Gradient overlay for depth */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a]/80 to-transparent" />
      
      {/* Decorative gradient orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
      
      {/* Content */}
      <div className="relative z-10 flex flex-col justify-between h-full">
        {/* Logo and brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 transition-transform hover:scale-105">
            <Sparkles className="h-5 w-5" />
          </div>
          <span className="text-xl font-light tracking-tight">applyo</span>
        </div>

        {/* Quote */}
        <div className="space-y-4 max-w-lg">
          <blockquote className="text-2xl xl:text-3xl font-light leading-relaxed tracking-tight">
            "This tool has transformed how we find and connect with decision-makers. 
            What used to take hours now takes minutes."
          </blockquote>
          <footer className="text-sm font-light text-[#a8a8a8]">
            - Sarah Chen, Growth Lead at TechCorp
          </footer>
        </div>
      </div>
    </div>
  );
}


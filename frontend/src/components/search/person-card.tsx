'use client';

import React, { useState, useEffect } from 'react';
import { Check, BadgeCheck, X, Send, Mail, Building2, FileText, ChevronDown, Loader2 } from 'lucide-react';
import type { OrchestratorPerson } from '@/lib/api';
import { protectedApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface PersonCardProps {
  person: OrchestratorPerson;
  favicon?: string | null;
  companyName?: string;
  index: number;
}

export function PersonCard({ person, favicon, companyName, index }: PersonCardProps) {
  const [isComposing, setIsComposing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [sendSuccess, setSendSuccess] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const [templates, setTemplates] = useState<Array<{ id: string; name: string; subject: string; body: string }>>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);

  useEffect(() => {
    if (isComposing) {
      setIsLoadingTemplates(true);
      protectedApi.listTemplates()
        .then(data => {
          if (data.success && data.templates) {
            setTemplates(data.templates);
          }
        })
        .catch(err => console.error('Failed to load templates:', err))
        .finally(() => setIsLoadingTemplates(false));
    }
  }, [isComposing]);

  const handleTemplateSelect = (template: { subject: string; body: string }) => {
    setEmailSubject(template.subject);
    // Replace placeholder variables if needed (e.g., {{firstName}})
    // For now, simple replacement
    const firstName = person.name.split(' ')[0];
    const company = companyName || 'your company';
    
    let body = template.body;
    body = body.replace(/{{firstName}}/g, firstName);
    body = body.replace(/{{company}}/g, company);
    
    setEmailBody(body);
  };

  const hasEmail = person.emails && person.emails.length > 0;
  const targetEmail = person.emails?.[0] ?? null;
  
  const domain = targetEmail ? targetEmail.split('@')[1] : null;
  const companyUrl = domain ? `https://${domain}` : null;

  const handleSendEmail = async () => {
    if (!targetEmail) return;
    
    setIsSending(true);
    setSendError(null);
    
    try {
      await protectedApi.sendEmail({
        to: targetEmail,
        subject: emailSubject,
        body: emailBody
      });
      setSendSuccess(true);
      setTimeout(() => {
        setIsComposing(false);
        setSendSuccess(false);
        setEmailSubject('');
        setEmailBody('');
      }, 2000);
    } catch (error) {
      setSendError((error as Error).message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
    <article
        className="opacity-0 animate-fade-in-up bg-[#151515] border border-[#2a2a2a] rounded-2xl sm:rounded-3xl p-5 sm:p-6 md:p-8 hover:border-[#3a3a3a] active:scale-[0.98] transition-all duration-300 flex flex-col h-full"
      style={{ animationDelay: `${index * 0.1}s` }}
    >
        <div className="flex flex-col gap-4">
          {/* Header: Name and Badge */}
          <div className="flex items-start gap-3 min-w-0 w-full">
            <h2 
              className="text-xl sm:text-2xl md:text-3xl font-light tracking-tight flex-1 min-w-0"
              style={{ 
                wordBreak: 'break-word',
                overflowWrap: 'anywhere',
                hyphens: 'auto'
              }}
            >
              {person.name}
            </h2>
            {hasEmail && (
              <Badge variant="secondary" className="bg-blue-500 text-white dark:bg-blue-600 h-6 px-2 font-sans font-light tracking-wide shrink-0 whitespace-nowrap flex-shrink-0 mt-0.5">
                <BadgeCheck className="w-3.5 h-3.5 mr-1.5" />
                Verified
              </Badge>
            )}
          </div>
            
          {/* Info Section */}
          <div className="space-y-3 flex-grow">
            {person.role && (
              <p 
                className="text-xs sm:text-sm md:text-base font-sans font-light text-[#6a6a6a] leading-relaxed min-w-0"
                style={{ 
                  wordBreak: 'break-word',
                  overflowWrap: 'anywhere'
                }}
              >
                {person.role}
              </p>
            )}

            {/* Company Info Row */}
            <div className="flex items-center gap-2 text-[#6a6a6a] min-w-0">
              {companyUrl ? (
                <a 
                  href={companyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 hover:text-[#e8e8e8] transition-colors group min-w-0 flex-1"
                >
                  {favicon ? (
                    <div className="w-5 h-5 rounded bg-white/5 p-0.5 flex items-center justify-center border border-white/10 group-hover:border-white/20 transition-colors shrink-0 flex-shrink-0">
            <img
              src={favicon}
              alt={`${companyName} logo`}
              className="w-full h-full object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
                    </div>
                  ) : (
                    <Building2 className="w-4 h-4 shrink-0 flex-shrink-0" />
                  )}
                  <span 
                    className="text-xs sm:text-sm font-sans font-light tracking-wide underline decoration-white/20 hover:decoration-white/50 transition-all min-w-0"
                    style={{ 
                      wordBreak: 'break-word',
                      overflowWrap: 'anywhere'
                    }}
                  >
                    {companyName || domain || 'Company Website'}
                  </span>
                </a>
              ) : (
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Building2 className="w-4 h-4 shrink-0 flex-shrink-0" />
                  <span 
                    className="text-xs sm:text-sm font-sans font-light tracking-wide min-w-0"
                    style={{ 
                      wordBreak: 'break-word',
                      overflowWrap: 'anywhere'
                    }}
                  >
                    {companyName}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Email Status & Action */}
        {hasEmail ? (
          <div className="mt-auto pt-6">
            <Button 
              onClick={() => setIsComposing(true)}
              className="w-full bg-white text-black hover:bg-gray-200 font-sans font-light tracking-wide"
            >
              <Mail className="w-4 h-4 mr-2" />
              Compose
            </Button>
          </div>
        ) : (
          <p className="text-xs sm:text-sm font-sans font-light text-[#4a4a4a] italic mt-auto pt-6">
            No verified emails found
          </p>
        )}
      </article>

      {/* Compose Modal */}
      {isComposing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setIsComposing(false)}
          />
          
          <div className="relative w-full max-w-lg bg-[#151515] border border-[#2a2a2a] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-[#2a2a2a]">
              <h3 className="text-lg font-medium text-white font-sans font-light tracking-wide">
                Send Email to {person.name}
              </h3>
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 gap-1 bg-transparent border-[#2a2a2a] text-gray-400 hover:text-white hover:bg-[#2a2a2a]">
                      <FileText className="w-3.5 h-3.5" />
                      <span className="text-xs">Templates</span>
                      <ChevronDown className="w-3 h-3 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 bg-[#151515] border-[#2a2a2a] text-white">
                    {isLoadingTemplates ? (
                      <div className="flex items-center justify-center p-2 text-gray-500">
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        <span className="text-xs">Loading...</span>
                      </div>
                    ) : templates.length === 0 ? (
                      <div className="p-2 text-xs text-gray-500 text-center">
                        No templates found
                      </div>
                    ) : (
                      templates.map(template => (
                        <DropdownMenuItem 
                          key={template.id} 
                          onClick={() => handleTemplateSelect(template)}
                          className="text-sm hover:bg-[#2a2a2a] cursor-pointer"
                        >
                          <span className="truncate">{template.name}</span>
                        </DropdownMenuItem>
                      ))
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  variant="ghost"
                  size="icon"
                  className="text-gray-400 hover:text-white"
                  onClick={() => setIsComposing(false)}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-400 font-sans font-light tracking-wide">Subject</label>
                <Input
                  placeholder="Enter subject..."
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="bg-[#0a0a0a] border-[#2a2a2a] text-white focus:border-gray-700 font-sans font-light tracking-wide"
                />
      </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-400 font-sans font-light tracking-wide">Message</label>
                <Textarea
                  placeholder="Write your message..."
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  className="min-h-[150px] bg-[#0a0a0a] border-[#2a2a2a] text-white focus:border-gray-700 resize-none font-sans font-light tracking-wide"
                />
              </div>

              {sendError && (
                <p className="text-sm text-red-400 bg-red-400/10 p-3 rounded-lg font-sans font-light tracking-wide">
                  {sendError}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 sm:p-6 pt-0 flex justify-end gap-3">
              <Button
                variant="ghost"
                onClick={() => setIsComposing(false)}
                className="text-gray-400 hover:text-white hover:bg-[#2a2a2a] font-sans font-light tracking-wide"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSendEmail}
                disabled={isSending || !emailSubject || !emailBody}
                className="bg-blue-600 hover:bg-blue-700 text-white min-w-[100px] font-sans font-light tracking-wide"
              >
                {isSending ? (
                  "Sending..."
                ) : sendSuccess ? (
                  <span className="flex items-center gap-2">
                    <Check className="w-4 h-4" /> Sent
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Send className="w-4 h-4" /> Send
                  </span>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

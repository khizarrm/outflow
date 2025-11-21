import { authClient } from './auth-client';

// Types
export interface OrchestratorPerson {
  name: string;
  role: string;
  emails?: string[];
}

export interface OrchestratorResponse {
  company: string;
  website: string;
  people: OrchestratorPerson[];
}

// Helper function for authenticated API calls
async function apiFetch(url: string, options: RequestInit = {}) {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
  const session = await authClient.getSession();
  
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  
  if (session?.session?.token) {
    headers.set('Cookie', `better-auth.session_token=${session.session.token}`);
  }

  const response = await fetch(`${baseUrl}${url}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  return response;
}

// Agents API
export const agentsApi = {
  orchestrator: async (params: { query: string }): Promise<OrchestratorResponse> => {
    const response = await apiFetch('/api/agents/orchestrator', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    if (!response.ok) throw new Error('Failed to run orchestrator');
    return response.json();
  },
};

// Protected API (requires authentication)
export const protectedApi = {
  // Templates
  listTemplates: async () => {
    const response = await apiFetch('/api/protected/templates', {
      method: 'GET',
    });
    if (!response.ok) throw new Error('Failed to list templates');
    return response.json();
  },

  createTemplate: async (data: { name: string; subject: string; body: string }) => {
    const response = await apiFetch('/api/protected/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create template');
    return response.json();
  },

  updateTemplate: async (id: string, data: { name?: string; subject?: string; body?: string }) => {
    const response = await apiFetch(`/api/protected/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update template');
    return response.json();
  },

  deleteTemplate: async (id: string) => {
    const response = await apiFetch(`/api/protected/templates/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete template');
    return response.json();
  },

  // Email
  sendEmail: async (data: { to: string; subject: string; body: string }) => {
    const response = await apiFetch('/api/protected/email/send', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to send email' }));
      throw new Error(error.message || error.error || 'Failed to send email');
    }
    return response.json();
  },
};

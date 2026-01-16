/**
 * NextAuth.js Configuration
 *
 * Supports Google and Microsoft OAuth for calendar access.
 * Includes organization and RBAC support.
 * Stores user accounts and calendar connections in Supabase.
 */

import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import AzureADProvider from 'next-auth/providers/azure-ad';
import { getSupabaseClient } from '../supabase/client';
import { isSuperadmin } from './superadmin';
import { getUserOrganizations, getOrgMembership } from '../db/organizations';
import type { OrgMemberRole } from '@/types/organization';

// Extend the session types
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      isSuperadmin: boolean;
      activeOrgId?: string | null;
      activeOrgRole?: OrgMemberRole | null;
      organizations?: Array<{
        id: string;
        name: string;
        slug: string;
        role: OrgMemberRole;
      }>;
    };
    accessToken?: string;
  }

  interface User {
    id: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
    email?: string;
    isSuperadmin?: boolean;
    activeOrgId?: string | null;
    activeOrgRole?: OrgMemberRole | null;
    organizations?: Array<{
      id: string;
      name: string;
      slug: string;
      role: OrgMemberRole;
    }>;
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    provider?: string;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/calendar',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID || '',
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET || '',
      tenantId: process.env.AZURE_AD_TENANT_ID || 'common',
      authorization: {
        params: {
          scope: 'openid email profile User.Read Calendars.ReadWrite',
        },
      },
    }),
  ],

  callbacks: {
    async signIn({ user, account }) {
      if (!account || !user.email) return false;

      const supabase = getSupabaseClient();

      try {
        // Check if user exists
        const { data: existingUser } = await supabase
          .from('users')
          .select('id')
          .eq('email', user.email)
          .single();

        if (!existingUser) {
          // Create new user
          const { data: newUser, error: createError } = await supabase
            .from('users')
            .insert({
              email: user.email,
              name: user.name,
              role: 'user',
              image: user.image,
            })
            .select('id')
            .single();

          if (createError) {
            console.error('Failed to create user:', createError);
            return false;
          }

          user.id = newUser.id;
        } else {
          user.id = existingUser.id;
        }

        // Store/update calendar connection with tokens
        const calendarProvider = account.provider === 'azure-ad' ? 'microsoft' : 'google';
        const { error: connectionError } = await supabase
          .from('calendar_connections')
          .upsert({
            user_id: user.id,
            provider: calendarProvider,
            provider_account_id: account.providerAccountId,
            email: user.email,
            access_token: account.access_token || '',
            refresh_token: account.refresh_token || null,
            token_expires_at: account.expires_at
              ? new Date(account.expires_at * 1000).toISOString()
              : null,
            scopes: account.scope?.split(' ') || [],
            is_primary: true,
          }, {
            onConflict: 'user_id,provider',
          });

        if (connectionError) {
          console.error('Failed to store calendar connection:', connectionError);
          // Don't fail sign-in for this
        }

        return true;
      } catch (error) {
        console.error('Sign-in error:', error);
        return false;
      }
    },

    async jwt({ token, user, account, trigger }) {
      // Initial sign-in
      if (account && user) {
        token.userId = user.id;
        token.email = user.email || undefined;
        token.isSuperadmin = isSuperadmin(user.email);
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpires = account.expires_at ? account.expires_at * 1000 : undefined;
        token.provider = account.provider;
      }

      // Load organizations on sign-in or session update
      if ((account && user) || trigger === 'update') {
        if (token.userId) {
          try {
            const memberships = await getUserOrganizations(token.userId);
            token.organizations = memberships.map(m => ({
              id: m.organization.id,
              name: m.organization.name,
              slug: m.organization.slug,
              role: m.role,
            }));

            // Auto-select org if only one
            if (memberships.length === 1 && !token.activeOrgId) {
              token.activeOrgId = memberships[0].organization.id;
              token.activeOrgRole = memberships[0].role;
            }
          } catch (error) {
            console.error('Failed to load organizations:', error);
            token.organizations = [];
          }
        }
      }

      // Return token if not expired
      if (token.accessTokenExpires && Date.now() < token.accessTokenExpires) {
        return token;
      }

      // Token expired, try to refresh
      // For now, just return the existing token - refresh logic added later
      return token;
    },

    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId;
        session.user.email = token.email || session.user.email;
        session.user.isSuperadmin = token.isSuperadmin || false;
        session.user.activeOrgId = token.activeOrgId || null;
        session.user.activeOrgRole = token.activeOrgRole || null;
        session.user.organizations = token.organizations || [];
        session.accessToken = token.accessToken;
      }
      return session;
    },
  },

  pages: {
    signIn: '/signin',
    error: '/signin',
  },

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  secret: process.env.NEXTAUTH_SECRET,
};

/**
 * Set active organization in session
 * Called from client via session update
 */
export async function setActiveOrganization(
  userId: string,
  organizationId: string
): Promise<{ activeOrgId: string; activeOrgRole: OrgMemberRole } | null> {
  const membership = await getOrgMembership(organizationId, userId);
  if (!membership) {
    return null;
  }
  return {
    activeOrgId: organizationId,
    activeOrgRole: membership.role,
  };
}

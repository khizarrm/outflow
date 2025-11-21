'use client';

import { Inbox, Search, Settings, User, LogOut, FileText, Building2 } from "lucide-react"
import { useRouter, usePathname } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import Image from "next/image"
import { useState } from "react"
import Link from "next/link"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  SidebarFooter,
} from "@/components/ui/sidebar"

// Menu items.
const items = [
  {
    title: "Search",
    url: "/",
    icon: Search,
  },
  {
    title: "Inbox",
    url: "/inbox",
    icon: Inbox,
  },
  {
    title: "Bank",
    url: "/bank",
    icon: Building2,
  },
  {
    title: "Templates",
    url: "/templates",
    icon: FileText,
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
  },
]

export function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending } = authClient.useSession();
  const [imageError, setImageError] = useState(false);
  const [showSignOut, setShowSignOut] = useState(false);

  const handleSignOut = async () => {
    try {
      await authClient.signOut();
      router.push('/login');
      router.refresh();
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  };

  // Get user display info - ensure we're working with strings
  const userName = session?.user?.name ? String(session.user.name) : 'Guest';
  const userEmail = session?.user?.email ? String(session.user.email) : 'guest@outreach.app';
  const userImage = session?.user?.image ? String(session.user.image) : null;
  const isAnonymous = !session?.user?.email;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex h-12 items-center gap-2 px-4 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <span className="font-semibold text-lg group-data-[collapsible=icon]:hidden">outreach</span>
          <SidebarTrigger className="ml-auto group-data-[collapsible=icon]:ml-0" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Application</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const isActive = pathname === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild tooltip={item.title} isActive={isActive}>
                      <Link href={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          {showSignOut && (
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={handleSignOut}
                tooltip="Sign out"
                className="text-muted-foreground hover:text-destructive animate-in slide-in-from-bottom-2 fade-in duration-200"
              >
                <LogOut />
                <span>Sign out</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              onClick={() => setShowSignOut(!showSignOut)}
            >
              {userImage && !imageError ? (
                <Image 
                  src={userImage} 
                  alt={userName}
                  width={32}
                  height={32}
                  className="rounded-full object-cover bg-sidebar-primary"
                  onError={() => setImageError(true)}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex aspect-square size-8 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground border border-sidebar-border">
                  <User className="size-4" />
                </div>
              )}
              <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-semibold">{userName}</span>
                <span className="truncate text-xs font-normal text-muted-foreground">{isAnonymous ? 'Guest User' : userEmail}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

"use client";

/** Scrollable content area for Hub routes; primary navigation lives in `AppSidebar`. */
export function SiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="hermes-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-4 py-5 md:px-6">
      {children}
    </div>
  );
}

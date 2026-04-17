import { AppShell } from "@/components/app-shell";
import { ChatRuntimeProvider } from "@/providers/chat-runtime-provider";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <ChatRuntimeProvider>
      <AppShell>{children}</AppShell>
    </ChatRuntimeProvider>
  );
}

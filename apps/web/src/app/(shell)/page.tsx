import dynamicImport from "next/dynamic";

const ChatInterface = dynamicImport(() => import("@/components/chat-interface").then((m) => m.ChatInterface), {
  ssr: false,
});

export const dynamic = "force-dynamic";

export default function Home() {
  return <ChatInterface />;
}
